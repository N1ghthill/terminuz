# 02 - Arquitetura - 6 Camadas

## Visão Geral

Terminuz segue uma arquitetura em 6 camadas, claramente separadas e com responsabilidades bem definidas. Esta arquitetura é inspirada no OpenCode CLI e adaptada para Node.js/TypeScript.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAMADA 6: INTERFACE TUI                       │
│  Terminal User Interface - Ink (React-style)                    │
│  Multi-painel: Chat | Status | Activity | Approvals             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              CAMADA 5: ORQUESTRAÇÃO E CONTROLE                   │
│  Task Planner | Workflow Engine | Subagent Manager              │
│  Decomposição | Chain | Parallel | Evaluator                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                CAMADA 4: AGENTE CORE (LLM)                       │
│  Multi-Provider | Failover | Tool Calling | Reasoning           │
│  OpenRouter | Claude | GPT-4 | DeepSeek | Zen/Go                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│             CAMADA 3: FERRAMENTAS E CAPACIDADES                  │
│  FileOps | CodeIntel | Shell | Git | Web                        │
│  read | write | edit | bash | git | search                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 CAMADA 2: MEMÓRIA E ESTADO                       │
│  Session State | Codebase Index | History | Cache               │
│  Effect Stores | Event Bus | Reactive Signals                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               CAMADA 1: AMBIENTE E SEGURANÇA                     │
│  Permission Gateway | Path Rules | Audit Log | Sandbox          │
│  Whitelist | Blacklist | Operation Levels | Approvals           │
└─────────────────────────────────────────────────────────────────┘
```

## Detalhamento das Camadas

### Camada 1: Ambiente e Segurança

**Responsabilidade**: Isolar e proteger o ambiente de execução.

**Componentes:**

- **Permission Gateway**: Central de autorizações
- **Path Whitelist/Blacklist**: Controle de acesso a diretórios
- **Operation Levels**: Níveis 0-4 de permissão
- **Audit Logger**: Registro de todas as ações
- **Sandbox**: Isolamento opcional (Docker)

**Fluxo:**

```
Tool Request → Permission Check → Path Validation → Audit Log → Execute
```

### Camada 2: Memória e Estado

**Responsabilidade**: Gerenciar estado da aplicação e contexto.

**Componentes:**

- **Session Manager**: Gerenciamento de sessões
- **Codebase Index**: Índice do projeto (sem vector DB)
- **Conversation History**: Histórico de mensagens
- **Tool Result Cache**: Cache de resultados
- **Event Bus**: Comunicação entre componentes

**Tecnologia**: Effect no runtime/core, Zustand na TUI e estado em memória para sessões/eventos.

### Camada 3: Ferramentas e Capacidades

**Responsabilidade**: Fornecer capacidades executáveis ao agente.

**Ferramentas:**

- **File Operations**: read_file, write_file, edit_file, list_dir
- **Code Intelligence**: analyze_code, lint, format
- **Search**: grep (ripgrep), file_search, symbol_search (LSP)
- **Shell**: bash, npm, pip (com restrições)
- **Git**: status, diff, commit, push, branch, checkout
- **Web**: fetch (para documentação)

**Interface:**

```typescript
interface Tool<TArgs, TResult> {
  name: string;
  description: string;
  parameters: ZodSchema<TArgs>;
  execute(args: TArgs, context: ToolContext): Effect<TResult>;
}
```

### Camada 4: Agente Core (LLM)

**Responsabilidade**: Processamento de linguagem natural e raciocínio.

**Componentes:**

- **Provider Registry**: Registro de providers disponíveis
- **Provider Abstraction**: Interface unificada
- **Failover Manager**: Troca automática em falhas
- **Tool Calling**: Invocação de ferramentas pelo LLM
- **Streaming Handler**: Processamento de streams

**Providers Suportados:**

- OpenRouter
- Anthropic (Claude)
- OpenAI (GPT-4)
- DeepSeek
- OpenCode Zen/Go

### Camada 5: Orquestração e Controle

**Responsabilidade**: Coordenar execução de tarefas complexas.

**Componentes:**

- **Task Planner**: Decompõe objetivos em subtarefas
- **Workflow Engine**: Executa padrões de workflow
- **Subagent Manager**: Delegação para subagentes especializados
- **State Machine**: Gerencia estado da execução

**Workflows:**

- **Chain**: Sequência linear de passos
- **Parallel**: Execução paralela de subtarefas
- **Evaluator-Optimizer**: Loop de refinamento
- **Orchestrator-Workers**: Delegação dinâmica

### Camada 6: Interface TUI

**Responsabilidade**: Interface com usuário via terminal.

**Componentes:**

- **App Component**: Componente raiz Ink
- **Chat Panel**: Área de chat e input
- **Status Panel**: Estado atual do agente
- **Activity Log**: Log de atividades
- **Approval Modal**: Diálogo de aprovações
- **Theme Provider**: Sistema de temas

**Layout:**

```
┌──────────────────────────────┬──────────────────────────────────────┐
│                              │  🔄 Status: Executando...            │
│  💬 Chat                     │  ──────────────────────────────────  │
│                              │  📋 Atividades:                      │
│  > Comando do usuário        │  • ✅ Lendo arquivo                  │
│                              │  • ✏️ Editando arquivo               │
│  Resposta do agente...       │  • 🔄 Executando testes              │
│                              │                                      │
│  [Progresso: 80%]            │  ⚠️ Pendentes (1):                   │
│                              │  [!] git push origin main            │
│                              │      [A]provar  [D]enegar            │
└──────────────────────────────┴──────────────────────────────────────┘
```

## Fluxo de Dados Entre Camadas

```
┌──────────┐
│  Camada  │  User Input: "Adicione autenticação JWT"
│    6     │  → Captura input → Envia para Camada 5
└────┬─────┘
     │
     ▼
┌──────────┐
│  Camada  │  Recebe input → Task Planner decompõe:
│    5     │  1. Analisar estrutura
│          │  2. Criar middleware JWT
│          │  3. Atualizar rotas
│          │  → Envia subtarefas para Camada 4
└────┬─────┘
     │
     ▼
┌──────────┐
│  Camada  │  Para cada subtarefa:
│    4     │  • Raciocina sobre approach
│          │  • Seleciona ferramentas
│          │  • Gera código/explicação
│          │  → Chama Camada 3
└────┬─────┘
     │
     ▼
┌──────────┐
│  Camada  │  Executa ferramentas:
│    3     │  • read_file("src/app.js")
│          │  • write_file("src/auth.js", code)
│          │  • bash("npm test")
│          │  → Retorna resultado
└────┬─────┘
     │
     ▼
┌──────────┐
│  Camada  │  Atualiza estado:
│    2     │  • Salva novo arquivo no índice
│          │  • Registra resultado dos testes
│          │  • Atualiza contexto
└────┬─────┘
     │
     ▼
┌──────────┐
│  Camada  │  Toda operação passa por:
│    1     │  • Permission Check
│          │  • Path Validation
│          │  • Audit Logging
└────┬─────┘
     │
     ▼
┌──────────┐
│  Camada  │  Retorna resultado ao usuário
│    6     │  "✅ Autenticação implementada!"
└──────────┘
```

## Princípios de Design

1. **Separação de Responsabilidades**: Cada camada tem uma função única
2. **Comunicação Unidirecional**: Dados fluem para baixo, eventos sobem
3. **Type Safety**: TypeScript strict mode em todas as camadas
4. **Imutabilidade**: Estado imutável com Effect
5. **Testabilidade**: Cada camada pode ser testada isoladamente

## Comparação com OpenCode

| Aspecto      | OpenCode        | Terminuz      |
| ------------ | --------------- | ------------- |
| Runtime      | Native binary   | Node.js       |
| State        | Effect          | Effect        |
| TUI          | OpenTUI (Solid) | Ink (React)   |
| Search       | ripgrep + LSP   | ripgrep + LSP |
| Distribution | Binary          | NPM           |

---

**Anterior**: [01 - Visão e Requisitos](./01-vision-and-requirements.md)  
**Próximo**: [03 - Stack Tecnológica](./03-technology-stack.md)
