# Migração da TUI — DeepCode → TUI do Qwen Code

> Documento de trabalho para retomar a migração em sessões futuras.
> Última atualização: 2026-05-16.

## 1. Objetivo

Substituir a TUI do DeepCode (que era instável e quebrava com frequência) pela
TUI do [Qwen Code](https://github.com/QwenLM/qwen-code), que é madura e usa a
mesma stack (Ink/React). A TUI antiga foi preservada — **não deletar**.

## 2. Decisões de arquitetura

- **Stack:** upgrade de Ink 4 → 7 e React 18 → 19 (`packages/cli` e
  `apps/deepcode`). Sem isso os componentes do Qwen exigiriam adaptação manual.
- **Backup:** TUI antiga em `packages/cli/src/tui-old/`, testes antigos em
  `packages/cli/test-old/`. Ambos excluídos de tsconfig/eslint/build. Não rodam,
  não são compilados — são só backup recuperável.
- **Layout espelhado:** a nova `packages/cli/src/tui/` espelha exatamente o
  layout `packages/cli/src/` do Qwen — `tui/ui/` = `ui/` do Qwen, mais
  `tui/config/`, `tui/utils/`, `tui/services/`, `tui/i18n/`. Isso mantém todos
  os imports relativos entre arquivos copiados válidos sem edição.
- **Shim do core:** o Qwen importa de `@qwen-code/qwen-code-core` e
  `@google/genai`. Esses pacotes não existem no DeepCode. São substituídos por
  `tui/qwen-core/index.ts` e `tui/qwen-core/genai.ts`, com aliases em
  `packages/cli/tsconfig.json` (`paths`): `@deepcode/tui-shim` e
  `@deepcode/tui-genai`. Cada arquivo copiado recebe um `sed` único trocando o
  import do pacote pelo alias. O shim cresce conforme a migração avança.
- **tsconfig:** `packages/cli` define `noUncheckedIndexedAccess: false` (o
  código do Qwen assume essa flag desligada). eslint: `no-undef` off para TS,
  `reportUnusedDisableDirectives` off.
- **Runtime intocado:** `packages/core` e `packages/shared` NÃO são modificados.
  Só a TUI e seus conectores.
- **Abordagem híbrida:** a shell do Qwen é um grafo conectado — não há estado
  intermediário que compile. Um port literal puro seria um big-bang de semanas
  sem validação. Por isso: portam-se os *componentes de UX* do Qwen (input,
  autocomplete, layout, render de mensagens, streaming) sobre um `UIState`/
  `AppContainer` **DeepCode-nativo e enxuto**. Descartam-se features Qwen-only
  (integração IDE, gerenciador de extensões, arena, diálogos MCP, rewind,
  welcome-back) — viram stubs inertes. Visual/UX continua 100% Qwen.

## 3. Procedimento de port (por arquivo)

1. Re-clonar o fonte do Qwen se necessário (fica em `/tmp`, volátil):
   `git clone --depth 1 https://github.com/QwenLM/qwen-code /tmp/qwen-code`
2. Copiar o arquivo de `/tmp/qwen-code/packages/cli/src/...` para o caminho
   espelhado em `tui/`.
3. `sed -i "s#'@qwen-code/qwen-code-core'#'@deepcode/tui-shim'#g; s#'@google/genai'#'@deepcode/tui-genai'#g"` no arquivo copiado.
4. `pnpm --filter @deepcode/cli typecheck`.
5. Para cada símbolo faltante: adicionar ao shim (`tui/qwen-core/index.ts`),
   aos contextos enxutos, ou stubar a feature Qwen-only.
6. Portar **bottom-up** (na ordem de dependências) — cada passo mantém o
   typecheck verde.

## 4. Estado atual (checkpoint 2026-05-16)

A migração está **funcionalmente completa** — Fases 0–4 do plano de produção
concluídas. A validação manual básica da Fase 5 foi executada; faltam apenas
limpeza final e release.

### Pronto

- `App.tsx` → `AppContainer`; `HistoryItemDisplay` / `MainContent` no fluxo real.
- Bridge de runtime completa: `createRuntime()` + `runtime.agent.run(...)` com
  **todos** os callbacks ligados — `onChunk`, `onChunkForTask`, `onUsage`
  (tokens input+output), `onIteration`, `onTaskUpdate`.
- Render de tools **ao vivo** durante o run via evento `activity`.
- `TaskPlanPanel`: painel do plano com status por task (plan mode).
- Aprovação interativa (`approval:request` / `approval:decision`).
- Slash commands: `/help`, `/clear`, `/diff`, `/provider`, `/model`, `/mode`,
  `/settings`, `/theme`, `/permissions`, `/auth` (alias `/login`).
- `/provider` abre um diálogo interativo: seleção de provider, configuração de
  API key e teste de conectividade com latência.
- Dialogs **interativos**: `ThemeDialog` (preview ao vivo), `PermissionsDialog`
  (cicla allow/ask/deny), `AuthDialog` (device flow OAuth inline).
- `/diff` com parsing real de git diff; `result.type` `tool` / `confirm_action`
  tratados.
- Robustez: turno parcial renderizado em abort/erro; tools inacabadas →
  `Canceled`; erro de tool sem render duplicado.
- Dev mode validado com `pnpm dev`: TUI abre em TTY real, sem `React is not
  defined` e sem loop de `DeepCode runtime initialized`.
- Lógica pura da bridge em `tui/bridge.ts` com 34 testes (`test/tui/`).

### Pendências

1. Remover o backup `tui-old/` + `test-old/` quando a nova TUI for considerada
   definitiva.
2. PR para `main`, version bump e release.

## 5. Stubs e TBDs a revisitar

Itens portados como stub inerte ou simplificados. Só implementar quando a
feature realmente entrar no escopo:

- `MermaidDiagram` (mostra source, sem render gráfico).
- `useStatusLine` (sem status line customizável).
- `useConfigInitMessage` (sem progresso de init de MCP no footer).
- `BackgroundTasksPill`, `MCPHealthPill`, `FeedbackDialog`, `ShellInputPrompt`,
  `AgentViewContext`, `BackgroundTaskViewContext`, `useFollowupSuggestions`.
- `i18n`: `t()` identidade (keys em inglês); locale completo fica para depois.

### Emendas conhecidas da migração

- **Tema:** `DeepCodeConfig.tui.theme` é um enum fixo legado da TUI antiga
  (`light|dark|high-contrast|nord|dracula`), incompatível com o set de temas
  do `themeManager` do Qwen. Como `packages/shared` é congelado, o tema é
  persistido num arquivo próprio da TUI: `.deepcode/tui-theme.json`.
- **Testes:** `tsconfig` tem `rootDir: src`, então `test/` não é coberto por
  `tsc`/`eslint` — os testes são validados apenas pelo vitest.

## 6. Validação atual

Todos os gates verdes (cli e raiz do monorepo):

- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm test` ✅ — suite completa do monorepo, incluindo E2E do app
- `pnpm build` ✅
- `pnpm dev` ✅ — smoke interativo curto em TTY real

## 7. Histórico de fases (branch `feat/tui-qwen-migration`)

- **Fase 0** (`0d6d9a9`, `82ec665`) — base estável: lint corrigido, WIP commitado.
- **Fase 1** (`4635b16`) — bridge do agente completa (tools ao vivo, `TaskPlan`).
- **Fase 2** (`2650553`) — dialogs interativos (theme/permissions/auth).
- **Fase 3** (`99f9830`) — robustez de abort/erro.
- **Fase 4** (`eacd217`) — `tui/bridge.ts` extraído + suíte de 34 testes.

## 8. Interface do runtime do DeepCode (referência da bridge)

- `createRuntime({ cwd, configPath, interactive })` → `DeepCodeRuntime`
  `{ config, events, sessions, cache, providers, agent, subagents, permissions, mcp }`.
- `runtime.agent.run({ session, input, mode, signal, onChunk, onChunkForTask,
  onUsage, onIteration, onTaskUpdate })`.
- `runtime.events` (`EventBus`): `activity`, `approval:request`,
  `approval:decision`, `app:error`.
- `runtime.permissions` (`PermissionGateway`): aprovações read/write/shell/dangerous.
