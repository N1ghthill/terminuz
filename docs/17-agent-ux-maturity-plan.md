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

## Baseline Atual

Data: 2026-06-23

Versao promovida: `deepcode-ai@1.2.76`

Estado:

- `latest`: `1.2.76`
- `stable`: `1.2.76`
- Branch principal: `main` em `24e4fe4 chore(release): v1.2.76`
- Validacao automatizada: `pnpm test`, `pnpm exec turbo run typecheck --force`, lint e build de release.
- Validacao real: DeepSeek oficial autenticado, `doctor` limpo, `run` real, leitura de arquivos real, `subagents run` com duas tarefas paralelas e teste manual da TUI em fluxo real.
- Resultado observado: fluxo mais fluido, sem problemas perceptiveis de flicker/sobreposicao, experiencia de uso considerada adequada para producao inicial.

Decisao operacional:

- Nao implementar novas features imediatamente sobre `1.2.76`.
- Usar a versao em tarefas reais por 2-3 dias.
- Registrar atritos neste documento antes de corrigir, exceto bugs bloqueantes ou regressao clara.
- Publicar novo patch somente se houver bug real, regressao, falha de instalacao ou ajuste pequeno com alto impacto.

## Janela de Observacao

Periodo sugerido: 2026-06-23 a 2026-06-26.

Objetivo: coletar sinais reais de producao sem introduzir mudancas prematuras.

Sinais a observar:

- [ ] TUI pisca, sobrepoe texto ou limpa area errada durante streaming.
- [ ] Subagente aparece como terminal/texto bruto na conversa principal.
- [ ] Aprovacao de subagente rouba foco ou fica visualmente ambigua.
- [ ] `task_batch` deixa subagente preso como running depois do fim do turno.
- [ ] Historico restaurado revive estado antigo de subagente.
- [ ] Limite de 20 iteracoes interrompe trabalho real sem checkpoint util.
- [ ] DeepSeek falha em modelo/catalogo ou entra em fallback inesperado.
- [ ] Uso com Node 22 instalado globalmente diverge do Node 22 portatil usado na validacao.
- [ ] `doctor` volta a falhar em ambiente limpo.

Template para registrar atrito:

```text
### Observacao YYYY-MM-DD - titulo curto

- Versao: 1.2.76
- Ambiente: terminal/OS/Node/provider/model
- Fluxo: TUI | run | subagents run | doctor | install
- Prompt ou comando:
- Esperado:
- Observado:
- Severidade: baixa | media | alta | bloqueante
- Reproduzivel: sim | nao | parcial
- Evidencia: log, screenshot, output, sessao
- Decisao: observar | corrigir patch | planejar feature | descartar
```

## Plano de Implementacao

### Fase 0 - Consolidar baseline

- [x] Identificar areas locais ja modificadas em TUI, subagentes, permissoes e loop.
- [x] Registrar diagnostico inicial neste documento.
- [x] Rodar a suite relevante antes de novas mudancas de comportamento:
  - [x] `pnpm --filter @deepcode/core test`
  - [x] `pnpm --filter @deepcode/cli test -- test/tui`
  - [x] `pnpm exec turbo run typecheck --force`
  - [x] `pnpm test`
- [x] Capturar/validar cenarios principais de subagente:
  - [x] prompt real com leitura de arquivos
  - [x] comando `subagents run` com duas tarefas paralelas
  - [x] teste manual da TUI em fluxo real
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

- [x] Criar log estruturado de runtime separado do audit log:
  - [x] `.deepcode/runtime.log` em JSONL.
  - [x] redacao de segredos usando `redactSecrets` e valores secretos da configuracao.
  - [x] rotacao simples ou limite de tamanho.
- [x] Eventos minimos:
  - [x] `turn.start`
  - [x] `turn.iteration.start`
  - [ ] `model.request`
  - [x] `model.usage`
  - [x] `tool.start`
  - [x] `tool.end`
  - [x] `tool.error`
  - [x] `subagent.start`
  - [x] `subagent.tool`
  - [x] `subagent.end`
  - [x] `approval.request`
  - [x] `approval.decision`
  - [ ] `turn.checkpoint`
  - [x] `turn.end`
- [x] Cada evento deve carregar IDs correlacionaveis quando disponiveis:
  - [x] `sessionId`
  - [x] `turnId`
  - [x] `iteration`
  - [ ] `toolCallId`
  - [x] `taskId`
  - [x] `parentSessionId`
- [x] Adicionar comando de suporte:
  - [x] `/logs recent`
  - [ ] `/logs export`
  - [x] `deepcode logs recent`
  - [x] `/doctor` deve indicar local e tamanho dos logs.

### Fase 5 - Validacao de producao

- [ ] Criar cenarios e2e/manuais de UX:
  - [x] tarefa curta sem tools.
  - [x] tarefa com leitura de arquivos.
  - [x] tarefa com subagentes paralelos via `subagents run`.
  - [ ] tarefa com varias tools e output grande.
  - [ ] tarefa com `task_batch` read-only dentro da TUI.
  - [ ] subagente que pede aprovacao.
  - [ ] subagente cancelado.
  - [ ] limite de iteracoes e continuacao.
- [ ] Adicionar snapshots TUI para largura estreita e larga.
- [ ] Medir numero de renders/segundo durante subagentes concorrentes.
- [ ] Confirmar que historico restaurado nao revive subagentes antigos como vivos.
- [x] Publicar e promover versao validada para `stable`.

### Fase 6 - Seguranca de release e empacotamento

- [x] Confirmar que `.deepcode/*` continua ignorado pelo git, mantendo apenas `.deepcode/.gitkeep` rastreado.
- [x] Rodar scan de secrets antes de publicar.
- [x] Remover source maps do pacote publico `deepcode-ai`, evitando publicar codigo-fonte expandido no tarball npm.
- [x] Adicionar gate de release com `npm pack --dry-run --json`.
- [x] Bloquear release se o pacote incluir:
  - [x] `.map`
  - [x] `.deepcode/*`
  - [x] `.env*`
  - [x] `config.json`
  - [x] `runtime.log`
  - [x] `audit.log`
  - [x] nomes de arquivo com padrao de chave, token, secret, credential ou password.
- [x] Confirmar tarball atual com 7 arquivos esperados:
  - [x] `LICENSE`
  - [x] `README.md`
  - [x] `dist/chunk-*.js`
  - [x] `dist/index.d.ts`
  - [x] `dist/index.js`
  - [x] `dist/lowlight-*.js`
  - [x] `package.json`

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

1. Observar `1.2.75` em uso real por 2-3 dias antes de iniciar nova feature.
2. Registrar atritos na janela de observacao acima, com comando/prompt e severidade.
3. Corrigir imediatamente apenas bugs bloqueantes, regressao de TUI/subagentes ou falha de instalacao.
4. Observar os logs em tarefas reais e verificar se falta algum evento antes de ampliar a instrumentacao.
5. Manter `pnpm secrets:scan`, `pnpm test`, `pnpm build` e validacao de `npm pack` como gates de release.
6. Depois da janela de observacao, retomar checkpoint/continuidade de `maxIterations` como proxima melhoria estrutural.

## Notas de Manutencao

- Este arquivo deve aceitar checklist incompleto. Nao transforme tudo em decisao definitiva cedo demais.
- Ao concluir uma etapa, marque o item e adicione link para teste, PR ou arquivo alterado.
- Se um comportamento mudar por decisao de produto, atualize tambem `docs/05-tui-design.md`, `docs/09-agent-loop.md` ou `docs/14-decisions-log.md` conforme o escopo.
