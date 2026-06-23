# 17 - Plano de Maturidade UX e Execucao do Agente

## Proposito

Este documento e o contexto vivo para amadurecer o DeepCode como agente de codificacao em producao. Ele consolida os problemas observados na TUI, subagentes e limite de iteracoes, relaciona esses pontos com o desenho atual do codigo e mantem um checklist maleavel para guiar implementacoes sem perder contexto entre sessoes.

Atualize este arquivo sempre que uma decisao for tomada, um teste novo cobrir um comportamento ou uma etapa mudar de prioridade.

## Norte

O DeepCode deve continuar sendo um agente produtivo, com TUI rica e recursos avancados. O objetivo nao e reduzir capacidades, e sim separar melhor os planos de execucao:

- Conversa principal: requisitos, decisoes, plano, resultados finais e pedidos de aprovacao realmente relevantes.
- Area viva da TUI: progresso curto, estavel, agregado e previsivel.
- Subagentes: trabalho paralelo com contexto isolado, progresso controlavel e sem despejar streaming bruto no terminal principal.
- Logs: trilha estruturada para depurar comportamento sem depender do que apareceu visualmente na TUI.
- Autonomia: tarefas grandes devem pausar com estado claro ou continuar com checkpoints, nunca parar abruptamente por limite numerico silencioso.

## Problemas Observados

### 1. TUI aparece informacao de forma abrupta

Sintoma: blocos de texto, resultados de tools e atualizacoes de estado surgem subitamente, causando sensacao de tela instavel.

Hipotese tecnica:

- A TUI ja usa buffering e janelas de streaming, mas ainda mistura tres fontes de atualizacao: `onChunk`, `onIteration` e `onToolsComplete`.
- `AppContainer` reduz atividades a cada 100ms e comita mensagens em pontos diferentes do turno; qualquer descompasso entre limpar area viva e adicionar itens ao `Static` produz "flash".
- Resultados de tool ainda podem entrar como bloco grande no historico, mesmo truncados.

Locais relevantes:

- `packages/cli/src/tui/AppContainer.tsx`: intervalo de 100ms para atividades e subagentes, handlers de eventos e commits de iteracao.
- `packages/cli/src/tui/ui/components/MainContent.tsx`: janela de streaming, renderizacao do `Static` e live tool group.
- `packages/cli/src/tui/bridge.ts`: mapeamento de mensagens runtime para historico visual.

Direcao:

- Tratar a TUI como uma maquina de estados com apenas uma "fonte visual viva" por vez.
- Commitar texto, tool calls e resumos em batches atomicos, com invariantes testaveis.
- Preferir resumos de atividade a dumps de output durante a execucao.

### 2. Subagente "pisca" no terminal principal

Sintoma: subagentes que deveriam atuar ocultos aparecem como um terminal paralelo piscando por cima da TUI, com informacao sobreposta.

Estado atual:

- O core ja modela subagentes com `SubagentManager`, `SubagentTaskRegistry` e eventos `subagent:start`, `subagent:chunk`, `subagent:tool`, `subagent:complete`.
- A TUI ja tem `SubagentsPanel`, `BackgroundTasksDialog`, `useSubagentState` e testes novos de estabilidade.
- O risco esta na ponte entre atividade do filho e area principal: se chunks, tool activities ou aprovacoes do filho entram no mesmo canal visual do pai, a UI parece corrompida.

Locais relevantes:

- `packages/core/src/agent/subagent-manager.ts`: cria sessoes filhas, propaga `onChunk` e `onToolActivity`.
- `packages/core/src/agent/subagent-task-registry.ts`: fonte de verdade para estado dos subagentes.
- `packages/core/src/tools/task-tool.ts`: define `task` e `task_batch`, incluindo restricoes de paralelismo.
- `packages/cli/src/tui/ui/hooks/useSubagentState.ts`: buffers e reconciliacao do painel.
- `packages/cli/src/tui/ui/components/messages/ToolGroupMessage.tsx`: filtros de subagentes panel-owned versus inline.

Direcao:

- Subagente em background nao deve renderizar texto no `MainContent` do pai enquanto roda.
- O pai deve ver apenas: contador, estado, ferramenta atual, ultima amostra curta e acoes de controle.
- O resultado final deve voltar como resumo consolidado no historico, sem transcript bruto.
- Aprovacoes originadas por subagentes devem ser rotuladas e focadas, mas nao roubar layout nem parecer output concorrente.

### 3. Limite padrao de 20 iteracoes interrompe tarefas grandes

Sintoma: em tarefas grandes, o agente chega em 20 iteracoes e para, mesmo que ainda exista trabalho claro.

Estado atual:

- `packages/shared/src/types/index.ts` define `maxIterations` com default 20.
- `packages/core/src/agent/agent.ts` usa `while (iterations < maxIterations)`.
- Ao atingir o limite, o agente emite mensagem pedindo para aumentar `maxIterations`; nao ha continuacao, checkpoint de trabalho, meta de longo prazo ou handoff automatico.

Direcao:

- Separar `maxIterations` de "fim do trabalho".
- Introduzir uma politica de continuidade: checkpoint, resumo do estado, lista de pendencias, decisao de continuar/pausar e possibilidade de auto-continuidade configuravel.
- Em tarefas grandes, usar plano persistente e progresso mensuravel; a iteracao deve limitar custo/risco por janela, nao matar a tarefa.

## Referencias de Agentes Consolidados

Estas referencias orientam o desenho, sem copiar comportamento de forma cega.

- Codex: subagentes servem para mover trabalho ruidoso para fora da thread principal, reduzir poluicao de contexto e retornar resumos. Codex tambem explicita que subagentes consomem mais tokens e devem ser usados para exploracao, testes, triagem e sumarizacao, com cuidado em fluxos write-heavy. Fonte: `https://developers.openai.com/codex/codex-manual.md`, secoes "Codex CLI features" e "Subagents" consultadas via manual oficial.
- Claude Code: diferencia subagents, agent view, agent teams e workflows. A documentacao reforca monitoramento por estado, painel `/agents` para subagentes, `/tasks` para background e agent view como tela agregada de sessoes independentes. Fontes: `https://code.claude.com/docs/en/agents`, `https://code.claude.com/docs/en/sub-agents`, `https://code.claude.com/docs/en/agent-view`.
- Claude Code hooks: possui eventos de lifecycle como `PreToolUse`, `PostToolBatch`, `SubagentStart`, `SubagentStop`, `Stop`, `StopFailure`, `PreCompact` e `PostCompact`, o que reforca a necessidade de logs/eventos estruturados alem da UI. Fonte: `https://code.claude.com/docs/en/hooks`.
- Qwen Code: documenta subagentes com contexto separado, ferramentas controladas, trabalho autonomo e visibilidade de progresso em tempo real. Tambem destaca Tool-Use Summaries, Status Line, Compact Mode e Fork Subagent como areas de UX relevantes. Fontes: `https://qwenlm.github.io/qwen-code-docs/en/users/features/sub-agents/`, `https://qwenlm.github.io/qwen-code-docs/en/users/overview/`.

## Principios de Design

1. Uma area visual, uma responsabilidade.
   A area principal mostra a conversa. O painel de background mostra progresso paralelo. Dialogs mostram controle e detalhes.

2. Streaming e scrollback nao competem.
   Texto em streaming fica em uma janela curta e estavel. Quando confirmado, entra no scrollback em batch atomico.

3. Subagente nao e terminal filho visivel.
   Subagente e um job com estado, nao uma segunda TUI. O transcript completo pode existir para debug/sessao filha, mas nao deve vazar para a thread principal.

4. Logs sao para depuracao, UI e para decisao.
   O usuario precisa saber "o que esta acontecendo" e "o que posso controlar". Logs estruturados precisam responder "por que aconteceu".

5. Limites devem gerar checkpoints.
   Todo limite operacional relevante deve produzir estado retomavel: plano, progresso, pendencias, riscos, proximo passo e comando/config para continuar.

## Plano de Implementacao

### Fase 0 - Consolidar baseline

- [x] Identificar areas locais ja modificadas em TUI, subagentes, permissoes e loop.
- [x] Registrar diagnostico inicial neste documento.
- [ ] Rodar a suite relevante antes de novas mudancas de comportamento:
  - [ ] `pnpm --filter @deepcode/core test`
  - [ ] `pnpm --filter @deepcode/cli test -- --run packages/cli/test/tui`
  - [ ] `pnpm typecheck`
- [ ] Capturar um cenario reproduzivel do flash de subagente:
  - [ ] prompt que cria `task`
  - [ ] prompt que cria `task_batch`
  - [ ] prompt com aprovacao vinda de subagente
  - [ ] prompt com output grande de tool

### Fase 1 - Estabilizar a TUI

- [ ] Definir contrato visual do turno:
  - [ ] `pendingAssistantText` so recebe texto do agente principal.
  - [ ] `liveToolCalls` so recebe tools da sessao principal.
  - [ ] subagentes vivos so aparecem no painel/dialog de background.
  - [ ] resultados finais de subagentes entram no historico como resumo unico.
- [ ] Criar teste de invariantes para `mapMessagesToHistoryItems` e `reduceToolActivity`:
  - [ ] atividade de sessao filha identificada nao deve aparecer como live tool do pai.
  - [ ] `task` em execucao nao deve renderizar bloco inline quando painel possui o estado.
  - [ ] erro/cancelamento de subagente deve deixar um resumo terminal.
- [ ] Revisar timing de commits:
  - [ ] `onIteration` nao deve limpar live area antes do item correspondente existir em `Static`.
  - [ ] `onToolsComplete` deve tratar tool-only turn sem duplicar mensagens.
  - [ ] fim do turno deve fazer um unico cleanup visual.
- [ ] Reduzir linhas informativas repetitivas no historico:
  - [ ] agregar "Iteracao X/Y" a status line/header quando possivel.
  - [ ] manter scrollback para eventos relevantes, nao heartbeat.

### Fase 2 - Isolar subagentes como jobs de background

- [ ] Tornar `SubagentTaskRegistry` a fonte unica para a TUI de subagentes.
- [ ] Garantir que `subagent:chunk` alimenta apenas amostra curta no painel/dialog, nunca o streaming principal.
- [ ] Persistir metadados suficientes por subagente:
  - [ ] `taskId`
  - [ ] `sessionId`
  - [ ] `parentSessionId`
  - [ ] `subagentType`
  - [ ] `status`
  - [ ] `currentTool`
  - [ ] `startedAt`
  - [ ] `completedAt`
  - [ ] `summary`
  - [ ] `error`
- [ ] Separar dois modos:
  - [ ] `task`: subagente bloqueante com retorno sintetizado ao pai.
  - [ ] `background task`: subagente destacavel, monitoravel e cancelavel.
- [ ] Adicionar controles minimos:
  - [ ] abrir detalhes
  - [ ] cancelar subagente
  - [ ] copiar/ver resumo
  - [ ] abrir sessao filha quando existir transcript
- [ ] Revisar politica de paralelismo:
  - [ ] manter mutacoes concorrentes bloqueadas ou isoladas por worktree.
  - [ ] permitir paralelismo livre para read-only.
  - [ ] expor `concurrency` de forma compreensivel na UI.

### Fase 3 - Transformar limite de iteracoes em continuidade

- [ ] Criar resultado estruturado para fim por limite:
  - [ ] motivo: `max_iterations`
  - [ ] iteracoes usadas
  - [ ] ultimo plano conhecido
  - [ ] arquivos alterados
  - [ ] ferramentas recentes
  - [ ] pendencias objetivas
  - [ ] proxima acao recomendada
- [ ] Adicionar prompt de checkpoint antes de parar:
  - [ ] "atingi o limite desta janela"
  - [ ] "estado atual"
  - [ ] "posso continuar automaticamente se configurado"
- [ ] Configurar politica:
  - [ ] `maxIterationsPerTurn`: limite de seguranca por turno.
  - [ ] `autoContinue`: `off | ask | on`.
  - [ ] `maxContinuationRounds`: teto para evitar runaway.
  - [ ] `continuationCheckpointEvery`: frequencia de resumo persistente.
- [ ] Implementar retomada:
  - [ ] comando `/continue` ou sugestao automatica no composer.
  - [ ] reaproveitar sessao e resumo, sem reiniciar contexto do zero.
  - [ ] nao repetir tools ja concluidas se houver checklist/progresso.
- [ ] Testar:
  - [ ] limite baixo (`maxIterations = 1`) gera checkpoint util.
  - [ ] continuacao nao duplica mensagens.
  - [ ] abort/cancel preserva estado parcial.

### Fase 4 - Logs e observabilidade

- [ ] Criar log estruturado de runtime separado do audit log:
  - [ ] `.deepcode/runtime.log` em JSONL.
  - [ ] redacao de segredos usando `redactSecrets`.
  - [ ] rotacao simples ou limite de tamanho.
- [ ] Eventos minimos:
  - [ ] `turn.start`
  - [ ] `turn.iteration.start`
  - [ ] `model.request`
  - [ ] `model.usage`
  - [ ] `tool.start`
  - [ ] `tool.end`
  - [ ] `tool.error`
  - [ ] `subagent.start`
  - [ ] `subagent.tool`
  - [ ] `subagent.end`
  - [ ] `approval.request`
  - [ ] `approval.decision`
  - [ ] `turn.checkpoint`
  - [ ] `turn.end`
- [ ] Cada evento deve carregar IDs correlacionaveis:
  - [ ] `sessionId`
  - [ ] `turnId`
  - [ ] `iteration`
  - [ ] `toolCallId`
  - [ ] `taskId`
  - [ ] `parentSessionId`
- [ ] Adicionar comando de suporte:
  - [ ] `/logs recent`
  - [ ] `/logs export`
  - [ ] `/doctor` deve indicar local e tamanho dos logs.

### Fase 5 - Validacao de producao

- [ ] Criar cenarios e2e de UX:
  - [ ] tarefa curta sem tools.
  - [ ] tarefa com varias tools e output grande.
  - [ ] tarefa com `task_batch` read-only.
  - [ ] subagente que pede aprovacao.
  - [ ] subagente cancelado.
  - [ ] limite de iteracoes e continuacao.
- [ ] Adicionar snapshots TUI para largura estreita e larga.
- [ ] Medir numero de renders/segundo durante subagentes concorrentes.
- [ ] Confirmar que historico restaurado nao revive subagentes antigos como vivos.
- [ ] Atualizar README e CHANGELOG antes do publish npm.

## Decisoes Em Aberto

- [ ] Subagentes devem poder continuar depois que o turno pai termina ou devem ser cancelados sempre?
  - Estado atual: `AppContainer` chama `cancelByParentSession` no fim do turno.
  - Decisao sugerida: separar `task` bloqueante de `background task` duravel.

- [ ] O painel de subagentes deve mostrar output parcial textual?
  - Decisao sugerida: mostrar no maximo uma amostra curta e ferramenta atual; detalhes completos so em dialog/sessao filha/log.

- [ ] Auto-continuidade deve ser padrao?
  - Decisao sugerida: `ask` por padrao em TUI, `off` em headless, `on` somente com teto configurado.

- [ ] Mutacoes paralelas devem usar worktree automaticamente?
  - Decisao sugerida: read-only pode compartilhar worktree; write-heavy deve ser sequencial ou isolado.

## Proximas Acoes Recomendadas

1. Rodar testes atuais para descobrir se as modificacoes locais ja estao consistentes.
2. Corrigir primeiro vazamento visual de subagente para `liveToolCalls`/`MainContent`, pois e o problema com maior impacto de confianca.
3. Implementar checkpoint de `maxIterations` antes de qualquer aumento de limite padrao.
4. Introduzir `runtime.log` JSONL pequeno e redigido para conseguir depurar a TUI sem depender de prints visuais.
5. So entao preparar versao npm, com changelog focado em estabilidade de TUI, subagentes e continuidade de tarefas longas.

## Notas de Manutencao

- Este arquivo deve aceitar checklist incompleto. Nao transforme tudo em decisao definitiva cedo demais.
- Ao concluir uma etapa, marque o item e adicione link para teste, PR ou arquivo alterado.
- Se um comportamento mudar por decisao de produto, atualize tambem `docs/05-tui-design.md`, `docs/09-agent-loop.md` ou `docs/14-decisions-log.md` conforme o escopo.
