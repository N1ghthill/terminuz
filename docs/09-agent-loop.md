# 09 - Loop do Agente

## Visão Geral

O loop do agente é o coração do Terminuz, responsável por orquestrar a interação entre o usuário, o LLM e as ferramentas.

## Fluxo Principal

```
┌─────────┐
│  User   │
│  Input  │
└────┬────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  1. RECEIVE                             │
│  Recebe input do usuário               │
│  Adiciona ao histórico                 │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  2. CLASSIFY TURN                       │
│  Conversa local, utilitário, ou tarefa  │
│  de workspace com ferramentas          │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  3. LLM CALL                            │
│  Envia contexto para o LLM             │
│  Streaming da resposta                 │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  4. PARSE RESPONSE                      │
│  Texto: mostra ao usuário              │
│  Tool call: executa ferramenta         │
│  Reasoning: registra pensamento        │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  5. EXECUTE TOOL (se tool call)         │
│  Valida permissões                     │
│  Executa ferramenta                    │
│  Retorna resultado                     │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  6. OBSERVE                             │
│  Adiciona resultado ao contexto        │
│  Verifica se há erro                   │
└─────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────┐
│  7. CHECK COMPLETION                    │
│  Tarefa completa? → Retorna ao usuário │
│  Não completa? → Volta para passo 3    │
└─────────────────────────────────────────┘
```

## Implementação Real

O loop atual não executa um `TaskPlanner` separado antes de todo trabalho. Em BUILD,
o agente classifica a intenção do usuário e chama o modelo diretamente com as
ferramentas permitidas. Decomposição de trabalho é delegada ao próprio modelo via
`task` e `task_batch`, que criam subagentes com sessões filhas e escopo próprio.

`Agent.run()` preserva a API textual usada por integrações existentes. Consumidores
que precisam de estado estruturado devem usar `Agent.runDetailed()`, que retorna o
texto final junto com ferramentas chamadas, arquivos modificados, checkpoint,
modelo/provedor efetivo, contagem de mensagens adicionadas e uso de tokens.

```typescript
class Agent {
  constructor(
    private providerManager: ProviderManager,
    private toolRegistry: ToolRegistry,
    private sessionManager: SessionManager,
    private config: AgentConfig,
  ) {}

  async run(sessionId: string, userInput: string): Promise<void> {
    const session = this.sessionManager.get(sessionId);

    // 1. Adiciona mensagem do usuário
    session.messages.push({
      role: "user",
      content: userInput,
    });

    // 2. Classifica a intenção do turno
    const turnStrategy = this.resolveTurnStrategy(userInput, mode);

    // 3. Loop principal
    let iterations = 0;
    const maxIterations = this.config.maxIterations || 50;

    while (iterations < maxIterations) {
      iterations++;

      // 4. Chama LLM
      const response = await this.callLLM(session, turnStrategy);

      // 5. Processa resposta
      const actions = this.parseResponse(response);

      // 6. Executa ações
      for (const action of actions) {
        if (action.type === "text") {
          // Streaming para TUI
          await this.streamText(action.content, session);

          session.messages.push({
            role: "assistant",
            content: action.content,
          });
        } else if (action.type === "tool_call") {
          const result = await this.executeTool(action, session);

          session.messages.push({
            role: "tool",
            content: result,
            tool_call_id: action.id,
          });
        } else if (action.type === "reasoning") {
          // Registra pensamento (não mostra ao usuário)
          this.logReasoning(action.content, session);
        }
      }

      // 7. Verifica se completou
      if (this.isTaskComplete(session)) {
        break;
      }

      // Aprovações são resolvidas dentro do PermissionGateway.
    }

    // Salva sessão
    await this.sessionManager.save(session);
  }

  private async callLLM(session: Session): Promise<Stream<Chunk>> {
    const messages = this.prepareMessages(session);
    const tools = this.toolRegistry.getToolDescriptions();

    return this.providerManager.chat(messages, {
      preferredProvider: this.config.defaultProvider,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      tools,
    });
  }

  private parseResponse(stream: Stream<Chunk>): Action[] {
    const actions: Action[] = [];
    let currentText = "";
    let currentTool: ToolCall | null = null;

    for (const chunk of stream) {
      switch (chunk.type) {
        case "delta":
          currentText += chunk.content;
          break;

        case "tool_call":
          if (currentText) {
            actions.push({ type: "text", content: currentText });
            currentText = "";
          }

          actions.push({
            type: "tool_call",
            id: chunk.id,
            name: chunk.tool,
            arguments: chunk.arguments,
          });
          break;

        case "reasoning":
          actions.push({ type: "reasoning", content: chunk.content });
          break;
      }
    }

    if (currentText) {
      actions.push({ type: "text", content: currentText });
    }

    return actions;
  }

  private async executeTool(toolCall: ToolCall, session: Session): Promise<string> {
    const tool = this.toolRegistry.get(toolCall.name);

    if (!tool) {
      return `Error: Tool ${toolCall.name} not found`;
    }

    const context: ToolContext = {
      sessionId: session.id,
      messageId: generateId(),
      worktree: session.worktree,
      directory: session.worktree,
      abortSignal: new AbortController().signal,
      requestPermission: (op) => this.requestApproval(op, session),
      logActivity: (act) => this.logActivity(act, session),
      emitEvent: (evt) => this.emitEvent(evt, session),
    };

    try {
      const result = await Effect.runPromise(tool.execute(toolCall.arguments, context));

      return typeof result === "string" ? result : result.output;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }
}
```

## Subagentes e Decomposição

O modelo pode chamar:

- `task`: executa uma subtarefa sequencial em uma sessão filha, opcionalmente com
  `subagent_type`, provider/model próprios e contexto herdado via `fork=true`.
- `task_batch`: executa subagentes read-only nomeados em paralelo, com validação
  de ferramentas seguras para evitar mutações concorrentes.

Esse desenho mantém o thread principal focado em decisões, síntese e aprovações,
enquanto exploração e análise paralela ficam isoladas em jobs de subagente.
},
{
"id": "2",
"description": "Create JWT middleware",
"type": "code",
"dependencies": ["1"]
}
]
`;

    const response = await this.llm.complete(prompt);
    const tasks = JSON.parse(response);

    return {
      objective,
      tasks: tasks.map(t => ({
        ...t,
        status: 'pending',
      })),
    };

}

async getNextTask(plan: TaskPlan): Promise<Task | null> {
// Encontra tarefa pronta (dependências satisfeitas)
return plan.tasks.find(t =>
t.status === 'pending' &&
t.dependencies.every(depId =>
plan.tasks.find(dt => dt.id === depId)?.status === 'completed'
)
) || null;
}
}

````

## Workflows

### 1. Chain Workflow
```typescript
class ChainWorkflow {
  async execute(steps: WorkflowStep[], context: Context): Promise<Result> {
    let result = context;

    for (const step of steps) {
      result = await step.execute(result);

      if (result.error) {
        // Tenta recovery ou falha
        const recovered = await this.attemptRecovery(step, result);
        if (!recovered) {
          throw new WorkflowError(`Step ${step.name} failed`);
        }
      }
    }

    return result;
  }
}
````

### 2. Parallel Workflow

```typescript
class ParallelWorkflow {
  async execute(steps: WorkflowStep[], context: Context): Promise<Result[]> {
    const results = await Promise.all(steps.map((step) => step.execute(context)));

    return results;
  }
}
```

### 3. Evaluator-Optimizer Workflow

```typescript
class EvaluatorOptimizerWorkflow {
  constructor(
    private generator: GeneratorStep,
    private evaluator: EvaluatorStep,
    private maxIterations: number = 5,
  ) {}

  async execute(input: string): Promise<string> {
    let current = await this.generator.generate(input);

    for (let i = 0; i < this.maxIterations; i++) {
      const evaluation = await this.evaluator.evaluate(current);

      if (evaluation.isGoodEnough) {
        return current;
      }

      current = await this.generator.improve(current, evaluation.feedback);
    }

    return current; // Retorna melhor esforço
  }
}
```

### 4. Orchestrator-Workers

```typescript
class OrchestratorWorkersWorkflow {
  async execute(task: string, context: Context): Promise<Result> {
    // 1. Orchestrator planeja
    const plan = await this.orchestrator.plan(task, context);

    // 2. Delega para workers em paralelo
    const results = await Promise.all(
      plan.subtasks.map((subtask) => this.worker.execute(subtask, context)),
    );

    // 3. Sintetiza resultados
    return this.orchestrator.synthesize(results);
  }
}
```

## Subagent System

```typescript
interface Subagent {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  model?: string;
  maxIterations?: number;
}

class SubagentManager {
  private subagents: Map<string, Subagent> = new Map();

  register(subagent: Subagent): void {
    this.subagents.set(subagent.name, subagent);
  }

  async delegate(parentSession: Session, subagentName: string, task: string): Promise<string> {
    const subagent = this.subagents.get(subagentName);

    if (!subagent) {
      throw new Error(`Subagent not found: ${subagentName}`);
    }

    // Cria sessão isolada
    const subSession = await this.sessionManager.create({
      worktree: parentSession.worktree,
      parentId: parentSession.id,
    });

    // Configura com prompt do subagent
    subSession.systemPrompt = subagent.prompt;
    subSession.allowedTools = subagent.tools;

    // Executa
    const agent = new Agent({
      ...this.config,
      defaultModel: subagent.model,
      maxIterations: subagent.maxIterations || 10,
    });

    await agent.run(subSession.id, task);

    // Retorna resumo
    return this.summarizeSession(subSession);
  }

  private summarizeSession(session: Session): string {
    // Extrai resultado relevante
    const lastMessage = session.messages.filter((m) => m.role === "assistant").pop();

    return lastMessage?.content || "Task completed";
  }
}
```

## Exemplo de Uso

```typescript
// Criar agente
const agent = new Agent({
  providerManager,
  toolRegistry,
  sessionManager,
  config: {
    defaultProvider: "anthropic",
    temperature: 0.7,
    maxIterations: 50,
  },
});

// Criar sessão
const session = await sessionManager.create({
  worktree: "/home/user/project",
});

// Executar
await agent.run(session.id, "Adicione autenticação JWT ao projeto");
```

---

**Anterior**: [08 - Sistema de Ferramentas](./08-tool-system.md)  
**Próximo**: [10 - Integração GitHub](./10-github-integration.md)
