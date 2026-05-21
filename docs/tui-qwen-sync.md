# TUI — Sync com Qwen Code v0.15.11

> Gerado em 2026-05-21. Referência: `/home/irving/ruas/repositorios/qwen-code` (clone `--depth 1` do commit mais recente).
>
> Este documento lista o que mudou no Qwen Code desde o port original (PR #6, 2026-05-16) e o que vale trazer para o DeepCode.

---

## Números gerais

| | Qwen Code | DeepCode TUI |
|---|---|---|
| Arquivos `.ts`/`.tsx` | 622 | 146 |
| Arquivos portados (em comum) | — | 129 |
| Só no Qwen (não portados) | 493 | — |
| Nativos do DeepCode | — | 17 |

---

## Arquivos portados que divergiram (Qwen evoluiu depois do port)

Esses arquivos existem em ambos mas o Qwen tem mudanças significativas que podem valer a pena trazer.

| Arquivo | Diff estimado | O que mudou no Qwen |
|---|---|---|
| `config/settings.ts` | ~1166 linhas | Muitos campos novos de configuração |
| `ui/components/PermissionsDialog.tsx` | ~1064 linhas | Refactor significativo, novos modos de permissão |
| `ui/components/ModelDialog.tsx` | ~827 linhas | Melhorias de UX no model picker |
| `ui/hooks/useStatusLine.ts` | ~695 linhas | Implementação real (era stub no port) |
| `ui/components/MainContent.tsx` | ~445 linhas | `ShowMoreLines`, `Notifications`, `AppHeader`, limite de linhas por mensagem |
| `ui/commands/types.ts` | ~386 linhas | Novos slash commands registrados |
| `ui/components/HistoryItemDisplay.tsx` | ~364 linhas | Novos tipos de item (stats, summary, compression, etc.) |
| `ui/components/ThemeDialog.tsx` | ~345 linhas | Melhorias no preview ao vivo de tema |
| `ui/contexts/UIStateContext.tsx` | ~267 linhas | Novos campos de estado global |
| `ui/components/InputPrompt.tsx` | ~235 linhas | Tab handling refinado, auto-accept indicator |
| `ui/hooks/useFollowupSuggestions.tsx` | ~178 linhas | Melhorias nas sugestões de follow-up |
| `ui/utils/mergeCompactToolGroups.ts` | ~174 linhas | (DeepCode tem customizações próprias aqui — avaliar caso a caso) |
| `ui/components/shared/text-buffer.ts` | ~157 linhas | Melhorias no buffer de texto do input |
| `ui/contexts/UIActionsContext.tsx` | ~128 linhas | Novas actions expostas |
| `ui/hooks/useConfigInitMessage.ts` | ~57 linhas | Inicialização de MCP no footer |

---

## Funcionalidades novas no Qwen — backlog de port

### Alta prioridade (UX direta, baixo risco de conflito)

- [x] **`ui/components/ShowMoreLines.tsx`** ✓ _portado em e41238d_
  Limita a altura de mensagens muito longas, adicionando um botão "show N more lines". Evita que respostas grandes travem a tela. Integra com `useUIState.constrainHeight`.

- [x] **`ui/hooks/useStatusLine.ts`** ✓ _melhorado em e41238d (refresh a cada 30s)_
  O DeepCode tem a estrutura mas a implementação é stub. O Qwen tem a versão completa com cwd + branch git + indicadores dinâmicos. ~695 linhas de diff para avaliar.

- [x] **`ui/components/Notifications.tsx`** ✓ _portado (versão nativa DeepCode)_
  Sistema de notificações inline (aparece acima do input). Exibe `startupWarnings` em box estilizada. AppContext.Provider adicionado ao render do AppContainer.

- [x] **`utils/export/`** ✓ _implementado nativamente em e41238d_
  Exportação do histórico de sessão em markdown e JSON via `/export <fmt>`.
  Usa `Message[]` do `@deepcode/shared` — sem dependências Qwen.

- [x] **`ui/components/messages/CompressionMessage.tsx`** ✓ _portado_
  Renderização visual dedicada para quando o contexto é comprimido. Usa `Spinner` enquanto pendente, mostra stats ao concluir.

- [x] **`ui/components/messages/SummaryMessage.tsx`** ✓ _portado_
  Renderização do resumo de contexto gerado pelo `/compact`.

### Média prioridade

- [ ] **`ui/components/SessionPicker.tsx` + `SessionPreview.tsx` + `StandaloneSessionPicker.tsx`**
  UI de seleção de sessões mais refinada (com preview de conteúdo). O DeepCode tem `SessionsDialog` próprio — avaliar se vale substituir ou mesclar.

- [ ] **`ui/components/views/ContextUsage.tsx`**
  Mostra uso do context window (tokens usados / total). Exposto via `/context`.

- [ ] **`ui/components/views/DoctorReport.tsx`**
  Relatório visual do `/doctor` com status formatado por categoria (pass/warn/fail).

- [ ] **`ui/components/subagents/`** (wizard de criação/gerenciamento)
  O DeepCode já tem subagents funcionais mas sem UI de gerenciamento interativa. O Qwen tem um wizard completo de criação (com seleção de ferramentas, cor, descrição) e um gerenciador de agentes. Candidato a port quando subagents entrar em foco de UX.

- [ ] **`ui/components/SettingsDialog.tsx`**
  Diálogo de configurações mais completo que o atual. Avaliar o delta em relação ao `PermissionsDialog` do DeepCode.

- [ ] **`ui/hooks/useGitBranchName.ts`**
  Branch git atual para exibir no status line / footer.

- [ ] **`ui/components/messages/BtwMessage.tsx`**
  Mensagens "by the way" — dicas contextuais inline do modelo.

- [ ] **`ui/components/messages/GoalStatusMessage.tsx`** + tipo `HistoryItemGoalStatus`
  Sistema de objetivo ("goal") que o Qwen introduziu. Avaliar se faz sentido para o DeepCode.

- [ ] **`ui/components/AppHeader.tsx`**
  Header fixo no topo da área de chat (versão, modo, provider). Integra com `MainContent`.

### Baixa prioridade / avaliar depois

- [ ] **`ui/components/StatsDisplay.tsx`** + `ModelStatsDisplay.tsx` + `ToolStatsDisplay.tsx`
  Painéis de estatísticas de uso (tokens, latência, ferramentas). Expostos via `/stats`.

- [ ] **`ui/utils/historyUtils.ts`** + `historyMapping.ts`
  Utilitários para manipulação de histórico (normalização, mapeamento).

- [ ] **`ui/utils/computeStats.ts`**
  Cálculo de estatísticas de sessão.

- [ ] **`ui/components/StickyTodoList.tsx`**
  Lista de TODOs persistente acima do input durante o run.

- [ ] **`ui/hooks/useTimer.ts`**
  Timer de sessão (tempo decorrido).

- [ ] **`ui/hooks/useLoadingIndicator.ts`**
  Loading indicator melhorado com frases cíclicas personalizáveis.

---

## Qwen-only — NÃO portar

Funcionalidades específicas do ecossistema Qwen/Google que não se aplicam ao DeepCode:

- `ui/components/arena/` — Arena de comparação de modelos
- `ui/components/extensions/` — Gerenciador de extensões do Qwen
- `ui/components/agent-view/` — View de agente multi-tab específica do Qwen
- `ui/auth/` + `QwenOAuthProgress.tsx` — OAuth do Qwen/Google
- `ui/components/FolderTrustDialog.tsx` + `ui/hooks/useFolderTrust.ts` — Trust de pastas (IDE integration)
- `ui/components/IdeTrustChangeDialog.tsx` — IDE trust
- `ui/components/RewindSelector.tsx` + `ui/hooks/useArenaInProcess.ts` — Rewind de sessão
- `ui/components/WorktreeExitDialog.tsx` — Saída de worktree (feature Qwen)
- `ui/commands/arenaCommand.ts`, `ideCommand.ts`, `extensionsCommand.ts`, `trustCommand.ts`, `rewindCommand.ts`
- `ui/hooks/useQwenAuth.ts`, `useWelcomeBack.ts`, `useWorktreeSession.ts`
- `ui/utils/kittyProtocolDetector.ts` + `terminalSetup.ts` — Setup de terminal específico

---

## Como fazer o port de um arquivo

```bash
# 1. Copiar do Qwen
cp /home/irving/ruas/repositorios/qwen-code/packages/cli/src/ui/components/Foo.tsx \
   /home/irving/ruas/repositorios/deepcode/packages/cli/src/tui/ui/components/Foo.tsx

# 2. Substituir imports do Qwen core pelo shim do DeepCode
sed -i \
  "s#'@qwen-code/qwen-code-core'#'@deepcode/tui-shim'#g; \
   s#'@google/genai'#'@deepcode/tui-genai'#g" \
  /home/irving/ruas/repositorios/deepcode/packages/cli/src/tui/ui/components/Foo.tsx

# 3. Verificar typecheck
pnpm --filter @deepcode/cli typecheck

# 4. Adicionar símbolos faltantes ao shim ou criar stubs para features Qwen-only
```

---

## Referências

- Qwen Code repo local: `/home/irving/ruas/repositorios/qwen-code`
- DeepCode TUI: `packages/cli/src/tui/`
- Shim do core Qwen: `packages/cli/src/tui/qwen-core/index.ts`
- Guia original de migração: `docs/tui-qwen-migration.md`
