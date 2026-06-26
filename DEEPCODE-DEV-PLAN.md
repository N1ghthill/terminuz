# Plano de Desenvolvimento — DeepCode Agent

> Plano de ação baseado na análise do código-fonte, `docs/17-agent-ux-maturity-plan.md`, `docs/15-handoff-next-steps.md` e `docs/04-implementation-phases.md`.
>
> Versão atual: `1.2.80` · Data: 2026-06-25

---

## Sumário

1. [Estado Atual](#1-estado-atual)
2. [Decisões em Aberto — Recomendações](#2-decisões-em-aberto--recomendações)
3. [Priorização Geral](#3-priorização-geral)
4. [Fase P0 — Continuidade de Iterações](#4-fase-p0--continuidade-de-iterações)
5. [Fase P0 — Estabilizar TUI](#5-fase-p0--estabilizar-tui)
6. [Fase P1 — Isolar Subagentes como Jobs de Background](#6-fase-p1--isolar-subagentes-como-jobs-de-background)
7. [Fase P2 — Completar Observabilidade](#7-fase-p2--completar-observabilidade)
8. [Fase P3 — Stubs e Validação Final](#8-fase-p3--stubs-e-validação-final)
9. [Cronograma Sugerido](#9-cronograma-sugerido)

---

## 1. Estado Atual

### Funcionalidades Implementadas

- **CLI**: `init`, `chat`, `run`, `review`, `doctor`, `cache`, `projects`, `sessions`, `config`, `github`, `subagents`, `logs`
- **Providers**: Anthropic, OpenAI, OpenRouter, DeepSeek, Groq, Ollama, OpenCode — com failover, retry 429/503, tool calling em streaming
- **Agent Loop**: modos PLAN e BUILD, context compression automática, token budget, resposta local para saudações/small-talk, **checkpoint estruturado ao atingir `maxIterations`**, checkpoints periódicos (`continuationCheckpointEvery`), **auto-continuação configurável (`off`/`ask`/`on`)**, **eventos `turn.checkpoint` e `model.request` no EventBus**
- **Ferramentas**: `read_file`, `write_file`, `edit_file`, `list_dir`, `search_text` (ripgrep), `search_files`, `search_symbols` (LSP), `bash`, `git`, `analyze_code`, `lint`, `test`, `fetch_web`, `task` (subagentes), MCP client
- **Segurança**: path whitelist/blacklist, permission gateway (once/session/always), audit log, secret redaction
- **TUI**: Ink 7 / React 19 — input com autocomplete, modo Vim, slash commands (`/help`, `/clear`, `/undo`, `/diff`, `/provider`, `/model`, `/mode`, `/compact`, `/sessions`, `/settings`, `/theme`, `/permissions`, `/auth`, `/feedback`, `/logs`, `/continue`), model picker, theme dialog, approval panel, task plan panel, tool cards, MCP health pill, status line, subagents panel, followup suggestions, session history persistente
- **GitHub**: OAuth device flow, issues, PRs, merge, review, `github solve` (issue → PR completo)
- **Subagentes**: `SubagentManager`, `SubagentTaskRegistry`, named agents (`.deepcode/agents/*.md`), painel TUI em tempo real, eventos EventBus
- **Workflows**: ChainWorkflow, ParallelWorkflow, EvaluatorOptimizerWorkflow
- **Infra**: Cache persistente, CI/CD, duas dist-tags npm (`latest` + `stable`), secret scan, release gates com `npm pack`

### O que está Pendente (Plano de Maturidade UX — docs/17)

| Fase | Descrição | Status |
|------|-----------|--------|
| **Fase 0** | Consolidar baseline | ✅ Quase completo (2/4 cenários manuais faltam) |
| **Fase 1** | Estabilizar TUI | ⚠️ Parcial (1.1/1.2/1.4 concluídos, 1.3 pendente) |
| **Fase 2** | Isolar subagentes como jobs de background | ⚠️ Iniciado (summary + cancelar no dialog; modo background durável pendente) |
| **Fase 3** | Continuidade de iterações | ✅ Completo (checkpoint, config, autoContinue, /continue, testes) |
| **Fase 4** | Logs e observabilidade | ✅ Completo (model.request, turn.checkpoint, toolCallId, logs export) |
| **Fase 5** | Validação de produção | ⚠️ 50% (4/8 cenários) |
| **Fase 6** | Segurança de release e empacotamento | ✅ Completo |

### Stubs Existentes (docs/15)

| Stub | Arquivo | O que seria |
|------|---------|-------------|
| `ShellInputPrompt` | `tui/ui/components/` | Input inline dentro de tool cards |
| `MermaidDiagram` | `tui/ui/utils/` | Render de diagramas Mermaid |
| `i18n` | `tui/i18n/` | Internacionalização (hoje função identidade) |
| Dialog fallback | `AppContainer.tsx` | "Not implemented yet" (fallback seguro) |

---

## 2. Decisões em Aberto — Recomendações

### D1: Subagentes devem poder continuar depois que o turno pai termina?

**Recomendação: implementar como opt-in (`background: true`), mantendo cancel-on-end como padrão.**

**Justificativa:**
- Comportamento atual (`AppContainer` → `cancelByParentSession` no fim do turno) é previsível e seguro
- Background subagents que sobrevivem ao pai introduzem complexidade: estado persistente, re-attachment, prevenção de resource leak
- Caso de uso real existe ("roda testes em background enquanto continuo codando") — deve ser possível, mas opt-in
- Implementação sugerida: parâmetro `detach: true` no `task` tool, registry marca como "orphaned", diálogo "Background Tasks" dedicado para monitorar/cancelar/re-anexar

### D2: Painel de subagentes deve mostrar output parcial textual?

**Recomendação: manter minimalista (status + ferramenta atual + amostra curta de ≤2000 chars como já está).**

**Justificativa:**
- O `SubagentsPanel` e `useSubagentState` atuais já limitam output corretamente
- Output bruto no painel principal causaria o flicker que a Fase 1 visa corrigir
- Melhoria opcional: atalho "expandir" que abre dialog com as últimas N linhas sem sair da TUI

### D3: Auto-continuidade deve ser padrão?

**Recomendação: `ask` na TUI, `off` em headless (`run`), `on` só com teto configurado (`maxContinuationRounds`).**

**Justificativa:**
- O estado antigo (hard stop aos 20 sem checkpoint) era a pior UX possível; agora há checkpoint estruturado e retomada controlada
- `ask` na TUI dá controle sem ser irritante: usuário vê resumo do que foi feito e decide
- `off` em headless é questão de segurança — agente runaway em CI seria desastroso
- `on` exige opt-in explícito com ceiling para evitar loops infinitos
- Coerente com a filosofia de "autonomia controlada" do projeto

### D4: Mutações paralelas devem usar worktree automaticamente?

**Recomendação: começar com file-locking (mutex por arquivo), evoluir para worktree só se necessário.**

**Justificativa:**
- Worktrees do Git são caras de criar e gerenciar; para read-only são desperdício
- Abordagem mais simples: rastrear arquivos sendo modificados e enfileirar writes por arquivo
- Prioridade baixa — maioria dos cenários reais é sequencial ou read-heavy

---

## 3. Priorização Geral

| Prioridade | Área | Itens | Impacto no Usuário | Esforço Estimado |
|-----------|------|-------|-------------------|-------------------|
| **P0** | Continuidade de iterações | 12 tasks | Alto — tarefas grandes param sem checkpoint | Médio (~3-5 dias) |
| **P0** | Estabilizar TUI | 8 tasks | Alto — flicker/instabilidade visível todo turno | Médio (~3-5 dias) |
| **P1** | Isolar subagentes como jobs | 12 tasks | Médio — visível só com subagentes | Alto (~5-8 dias) |
| **P2** | Completar observabilidade | 4 tasks | Baixo — apenas debugging | ✅ Concluído |
| **P3** | Stubs + cenários faltantes | 6 items | Baixo — borda | Baixo (~1-2 dias) |

---

## 4. Fase P0 — Continuidade de Iterações

> Ref: `docs/17-agent-ux-maturity-plan.md` § Fase 3
>
> Arquivos-chave:
> - `packages/core/src/agent/agent.ts` (linhas 233, 306, 329, 489-490)
> - `packages/shared/src/types/index.ts` (linha 302 — schema `maxIterations`)
> - `packages/cli/src/tui/AppContainer.tsx`
> - `packages/cli/src/tui/ui/components/Composer.tsx`

### Problema (RESOLVIDO)

Quando `maxIterations` (default 20) é atingido, o agente agora emite um checkpoint estruturado com arquivos modificados, ferramentas recentes e opção de continuar via `/continue` ou `autoContinue`.

### Tarefas — ✅ Concluído

- [x] **3.1 — Checkpoint estruturado**
  - [x] Tipo `ContinuationCheckpoint` criado em `packages/shared/src/types/index.ts` com: `reason`, `iterationsUsed`, `filesModified`, `recentTools`, `turnId`
  - [x] Mensagem genérica substituída por checkpoint estruturado em `agent.ts` com info de arquivos modificados e ferramentas recentes
  - [x] Evento `turn.checkpoint` emitido no EventBus com os dados do checkpoint

- [x] **3.2 — Configuração de continuidade**
  - [x] Adicionado ao schema `DeepCodeConfigSchema`:
    - `autoContinue`: `z.enum(["off", "ask", "on"]).default("ask").optional()`
    - `maxContinuationRounds`: `z.number().int().positive().default(3).optional()`
    - `continuationCheckpointEvery`: `z.number().int().positive().default(10).optional()`

- [x] **3.3 — Lógica de continuidade no agent loop**
  - [x] No fim do turno, se `autoContinue === "on"` e `continuationRounds < maxContinuationRounds`: continua automaticamente
  - [x] Se `autoContinue === "ask"`: checkpoint emitido, usuário vê `/continue` como opção
  - [x] Se `autoContinue === "off"`: checkpoint emitido e agente para (comportamento atual melhorado)
  - [x] Retomada reaproveita session.messages acumulados — sem duplicação

- [x] **3.4 — Comando `/continue` na TUI**
  - [x] Slash command `/continue` adicionado em `packages/cli/src/tui/ui/commands/continueCommand.ts`
  - [x] Submete "Continue the task from where you left off." ao agente
  - [x] Registrado em `AppContainer.tsx`

- [x] **3.5 — Testes**
  - [x] `maxIterations = 3` gera checkpoint com `reason: "max_iterations"`, `iterationsUsed >= 3`, `recentTools` populado
  - [x] Evento `turn.checkpoint` recebido via EventBus
  - [x] Output contém "Continue" (sugestão de ação)
  - [x] `autoContinue="on"` executa rodadas reais até `maxContinuationRounds`
  - [x] `continuationCheckpointEvery` emite checkpoint de progresso com `reason: "progress"`

**Arquivos alterados:**
- `packages/shared/src/types/index.ts` — `ContinuationCheckpoint`, `AutoContinueModeSchema`, campos de config
- `packages/core/src/events/event-bus.ts` — `turn.checkpoint` + `model.request` events
- `packages/core/src/agent/agent.ts` — rastreamento de ferramentas/arquivos, checkpoint, loop de autoContinue
- `packages/cli/src/tui/ui/commands/continueCommand.ts` — novo comando `/continue`
- `packages/cli/src/tui/AppContainer.tsx` — registro do comando
- `packages/core/test/agent-tool-loop.test.ts` — teste de checkpoint

---

## 5. Fase P0 — Estabilizar TUI

> Ref: `docs/17-agent-ux-maturity-plan.md` § Fase 1
>
> Arquivos-chave:
> - `packages/cli/src/tui/AppContainer.tsx` (intervalo 100ms, handlers, commits de iteração)
> - `packages/cli/src/tui/ui/components/MainContent.tsx` (streaming window, Static, live tool group)
> - `packages/cli/src/tui/bridge.ts` (mapeamento runtime → histórico visual)
> - `packages/cli/src/tui/ui/hooks/useSubagentState.ts`

### Problema
Blocos de texto, resultados de tools e atualizações de estado surgem subitamente, causando sensação de tela instável. Três fontes de atualização competem: `onChunk`, `onIteration` e `onToolsComplete`.

### Tarefas

- [x] **1.1 — Contrato visual do turno**
  - [x] `pendingAssistantText` só recebe texto do agente principal (subagentes usam `subagent:chunk` separado)
  - [x] `liveToolCalls` só recebe tools da sessão principal (via `activityBelongsToSession` e filtro `isSubagentActivity`)
  - [x] Subagentes vivos só aparecem no `SubagentsPanel` / `BackgroundTasksDialog`
  - [x] Resultados finais de subagentes entram no histórico como tool_group com resumo, não como transcript bruto

- [x] **1.2 — Testes de invariantes**
  - [x] Testes criados em `packages/cli/test/tui/bridge.test.ts`:
    - `activityBelongsToSession` rejeita atividades de sessão filha
    - Subagent `tool_call` produz `AgentResultDisplay` (task_execution), não bloco inline
    - Subagent cancelado sem tool result fica como `Canceled` com `"Cancelled."`
    - Resultado de subagente entra no histórico como `tool_group` com `resultDisplay` textual
    - Tool result sem assistant message correspondente não produz itens

- [ ] **1.3 — Revisar timing de commits**
  - [ ] `onIteration` não deve limpar live area antes do item correspondente existir em `Static`
  - [ ] `onToolsComplete` deve tratar tool-only turn sem duplicar mensagens
  - [ ] Fim do turno deve fazer um único cleanup visual atômico

- [x] **1.4 — Reduzir linhas informativas repetitivas**
  - [x] Remover heartbeat "Iteração X/Y" do histórico
  - [x] Manter scrollback para eventos relevantes, não heartbeat de iteração

---

## 6. Fase P1 — Isolar Subagentes como Jobs de Background

> Ref: `docs/17-agent-ux-maturity-plan.md` § Fase 2
>
> Arquivos-chave:
> - `packages/core/src/agent/subagent-task-registry.ts`
> - `packages/core/src/agent/subagent-manager.ts`
> - `packages/core/src/tools/task-tool.ts`
> - `packages/cli/src/tui/ui/hooks/useSubagentState.ts`
> - `packages/cli/src/tui/ui/components/SubagentsPanel.tsx`
> - `packages/cli/src/tui/ui/components/background-view/BackgroundTasksDialog.tsx`
> - `packages/cli/src/tui/ui/components/background-view/BackgroundTasksPill.tsx`

### Problema
Subagentes que deveriam atuar ocultos aparecem como terminal paralelo piscando sobre a TUI. Chunks, tool activities ou aprovações do filho entram no mesmo canal visual do pai.

### Tarefas

- [ ] **2.1 — SubagentTaskRegistry como fonte única**
  - [ ] Garantir que a TUI consome subagentes exclusivamente via `SubagentTaskRegistry.subscribe()`
  - [ ] Remover caminhos paralelos de notificação (eventos EventBus sendo usados diretamente pela TUI)
  - [ ] Garantir que `subagent:chunk` alimenta apenas amostra curta no painel, nunca o streaming principal

- [ ] **2.2 — Metadados completos por subagente**
  - [x] Adicionar ao `SubagentTaskRecord`: `summary`, `parentSessionId` (já existe), `subagentType` (já existe)
  - [ ] Garantir persistência dos metadados para sessões filhas

- [ ] **2.3 — Dois modos de subagente**
  - [ ] `task` (atual): bloqueante, retorno sintetizado ao pai, cancelado com o turno pai
  - [ ] `background task` (novo): destacável, monitorável, cancelável, sobrevive ao turno pai
  - [ ] Adicionar campo `mode: "task" | "background"` no `task-tool.ts`

- [ ] **2.4 — Controles no BackgroundTasksDialog**
  - [x] Abrir detalhes do subagente (output parcial, resumo, erros)
  - [x] Cancelar subagente
  - [ ] Copiar/ver resumo
  - [ ] Abrir sessão filha quando existir transcript

- [ ] **2.5 — Política de paralelismo**
  - [ ] Mutações concorrentes bloqueadas ou isoladas por file-lock
  - [ ] Paralelismo livre para read-only
  - [ ] Expor `concurrency` de forma compreensível na UI

- [ ] **2.6 — Testes**
  - [ ] `task_batch` read-only dentro da TUI
  - [ ] Subagente que pede aprovação
  - [ ] Subagente cancelado
  - [ ] Limite de iterações + continuação com subagentes pendentes

---

## 7. Fase P2 — Completar Observabilidade

> Ref: `docs/17-agent-ux-maturity-plan.md` § Fase 4

### Tarefas

- [x] **4.1 — Eventos faltantes**
  - [x] `model.request` — emitido antes de cada chamada LLM com provider, model e estimativa de input tokens
  - [x] `turn.checkpoint` — implementado e emitido em `agent.ts` ao atingir `maxIterations`

- [x] **4.2 — Campos correlacionáveis**
  - [x] `toolCallId` nos eventos/logs de ferramenta

- [x] **4.3 — Comando de suporte**
  - [x] `/logs export` e `deepcode logs export` — exportar logs para arquivo

---

## 8. Fase P3 — Stubs e Validação Final

> Ref: `docs/17-agent-ux-maturity-plan.md` § Fase 5, `docs/15-handoff-next-steps.md`

### Tarefas

- [ ] **5.1 — Stubs (implementar se entrar em escopo)**
  - [ ] `ShellInputPrompt` — input inline dentro de tool cards (necessário apenas se tool cards precisarem de interação)
  - [ ] `MermaidDiagram` — render de diagramas Mermaid (baixa prioridade)
  - [ ] `i18n` — internacionalização real (apenas se houver demanda multilíngue)

- [ ] **5.2 — Cenários E2E faltantes**
  - [ ] Tarefa com várias tools e output grande
  - [ ] `task_batch` read-only dentro da TUI
  - [ ] Subagente que pede aprovação
  - [ ] Subagente cancelado
  - [ ] Limite de iterações + continuação

- [ ] **5.3 — Métricas**
  - [ ] Medir número de renders/segundo durante subagentes concorrentes
  - [ ] Confirmar que histórico restaurado não revive subagentes antigos como vivos

---

## 9. Cronograma Atualizado

```
Fase P0 — Continuidade de Iterações
├── ✅ Concluído: checkpoint estruturado, schema, autoContinue, /continue, testes

Fase P0 — Estabilizar TUI
├── ✅ Concluído: contrato visual + testes de invariantes + redução de linhas repetitivas (1.1/1.2/1.4)
├── ⏳ Pendente: revisão de timing de commits (1.3)

Fase P1 — Subagentes como Jobs de Background
├── ⚠️ Iniciado: summary por tarefa + cancelar no BackgroundTasksDialog
├── ⏳ Pendente: modo background durável, persistência/re-attach, copiar/abrir sessão filha

Fase P2 — Observabilidade
├── ✅ Concluído: model.request, turn.checkpoint, toolCallId e logs export

Fase P3 — Stubs + Validação Final
├── ⏳ Pendente
```

**Progresso geral: P0 quase completo (continuidade completa, TUI só com 1.3 pendente); P2 completo. Próximo grande bloco: P1 background subagents.**

---

## Referências

- [docs/17-agent-ux-maturity-plan.md](./docs/17-agent-ux-maturity-plan.md) — plano de maturidade UX com checklist vivo
- [docs/15-handoff-next-steps.md](./docs/15-handoff-next-steps.md) — handoff com stubs e checklist de produção
- [docs/04-implementation-phases.md](./docs/04-implementation-phases.md) — fases originais de implementação (concluídas)
- [docs/09-agent-loop.md](./docs/09-agent-loop.md) — documentação do agent loop
- [docs/05-tui-design.md](./docs/05-tui-design.md) — design da TUI
- [CHANGELOG.md](./CHANGELOG.md) — histórico de versões
