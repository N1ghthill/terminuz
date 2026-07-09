# 18 - Roadmap de Rebranding para Terminuz

## Proposito

Este documento e a fonte de verdade para migrar o produto atualmente publicado como DeepCode para:

> **Terminuz - The Open Source AI Coding Agent**

O nome do produto e **Terminuz**. A frase complementar explica a categoria do produto e nao faz parte do nome.

A migracao afeta marca, distribuicao, comandos, configuracao, dados persistidos, documentacao, automacoes e canais externos. Por isso, ela deve acontecer em fases pequenas, testaveis e reversiveis, sem interromper usuarios existentes ou perder configuracoes e historico.

Atualize este arquivo em todo PR da migracao que:

- conclua ou bloqueie um item;
- altere uma decisao;
- descubra uma nova superficie afetada;
- mude a estrategia de compatibilidade;
- publique uma versao de transicao;
- altere o proximo checkpoint.

## Estado Inicial

Data do inventario inicial: **2026-07-08**

- Produto em producao: `DeepCode`
- Pacote publico: `deepcode-ai@1.2.83`
- Binarios publicados: `deepcode` e `deepcode-ai`
- Repositorio: `N1ghthill/deepcode`
- Diretorio de projeto: `.deepcode/`
- Variaveis proprias: `DEEPCODE_*`
- Pacotes internos: `@deepcode/cli`, `@deepcode/core`, `@deepcode/shared`
- App publicavel no monorepo: `apps/deepcode`
- Ocorrencias rastreadas do nome antigo no repositorio: aproximadamente 1.284 em 224 arquivos
- Branch observada durante o inventario: `refactor/appcontainer-runtime-hooks`
- Worktree observado durante o inventario: limpo

O numero de ocorrencias e uma referencia de escopo, nao uma meta de substituicao cega. Algumas referencias antigas deverao permanecer temporariamente como aliases, fallbacks, fixtures de migracao ou notas historicas.

## Resultado Esperado

A migracao estara concluida quando:

- novos usuarios instalarem `terminuz` e executarem `terminuz`;
- toda superficie publica ativa usar a marca Terminuz;
- `.terminuz/` e `TERMINUZ_*` forem os identificadores preferenciais;
- usuarios existentes continuarem conseguindo usar configuracoes e sessoes antigas;
- o pacote `deepcode-ai` conduzir usuarios para o novo pacote sem quebrar imediatamente;
- releases, update checker, instalacao, desinstalacao e canais `latest`/`stable` operarem com o novo pacote;
- o repositorio, links, templates e canais externos apontarem para Terminuz;
- referencias legadas remanescentes estiverem documentadas e cobertas por testes;
- houver uma politica explicita, datada e comunicada para retirar cada compatibilidade legada.

## Fora de Escopo

O rebranding nao deve ser usado para:

- reescrever arquitetura sem necessidade para a migracao;
- alterar formatos de configuracao que nao dependam da identidade do produto;
- redesenhar fluxos da TUI alem do necessario para aplicar a nova marca;
- remover compatibilidade apenas para deixar o codigo visualmente uniforme;
- incluir assets incompletos ou temporarios em uma release estavel;
- prometer protecao juridica com base apenas em disponibilidade de dominio, npm ou GitHub.

Mudancas funcionais independentes devem seguir em PRs separados.

## Principios da Migracao

1. **Compatibilidade antes de limpeza.**
   Identificadores antigos so podem ser removidos depois de existir alternativa, fallback, aviso e janela de migracao.

2. **Nenhuma perda silenciosa de dados.**
   `.deepcode/` nunca deve ser apagado, sobrescrito ou movido automaticamente sem estrategia testada e recuperavel.

3. **Novo nome para escrita, nome antigo para leitura.**
   Novas instalacoes e novos arquivos usam Terminuz. Identificadores DeepCode permanecem como fallback temporario.

4. **Uma fonte de verdade para identidade.**
   Nome, pacote, comando, caminhos, variaveis e URLs nao devem continuar espalhados como strings independentes.

5. **Release e rollback fazem parte da implementacao.**
   Cada fase que muda comportamento de producao precisa de criterio de aceite, telemetria observavel e plano de reversao.

6. **Historico nao e superficie ativa.**
   Changelogs, ADRs e documentos arquivados podem preservar referencias historicas quando isso mantiver o contexto correto.

## Contrato de Identidade

### Identificadores pretendidos

| Superficie           | Identificador preferencial        | Legado temporario                |
| -------------------- | --------------------------------- | -------------------------------- |
| Marca                | `Terminuz`                        | `DeepCode`                       |
| Descricao            | `The Open Source AI Coding Agent` | descricoes anteriores            |
| Pacote npm publico   | `terminuz`                        | `deepcode-ai`                    |
| Comando              | `terminuz`                        | `deepcode`, `deepcode-ai`        |
| Diretorio de projeto | `.terminuz/`                      | `.deepcode/`                     |
| Variaveis do produto | `TERMINUZ_*`                      | `DEEPCODE_*`                     |
| Namespace interno    | `@terminuz/*`                     | `@deepcode/*`                    |
| App do monorepo      | `apps/terminuz`                   | `apps/deepcode`                  |
| Repositorio          | `N1ghthill/terminuz`              | redirect de `N1ghthill/deepcode` |
| Tema padrao nomeado  | `terminuz-dark`                   | `deepcode-dark`                  |

### Precedencia de configuracao

Quando os dois identificadores existirem, a precedencia deve ser:

1. flag ou caminho explicito informado pelo usuario;
2. variavel `TERMINUZ_*`;
3. variavel legada `DEEPCODE_*`;
4. arquivo em `.terminuz/`;
5. arquivo legado em `.deepcode/`;
6. valor default.

Conflitos entre `.terminuz/` e `.deepcode/` devem preferir `.terminuz/` e produzir aviso curto, acionavel e nao repetitivo.

### Politica inicial para dados

- Novos projetos: criar `.terminuz/`.
- Projetos apenas com `.deepcode/`: ler o estado legado sem perda.
- Projetos com os dois diretorios: usar `.terminuz/` como primario e consultar o legado apenas onde o contrato de migracao permitir.
- Escrita nova: direcionar para `.terminuz/`, exceto durante uma fase de compatibilidade em que um componente ainda dependa explicitamente do caminho antigo.
- Migracao automatica: somente depois de testes de copia atomica, idempotencia, conflito, permissao e rollback.
- Exclusao do legado: nunca automatica durante o periodo de transicao.

### Politica inicial para variaveis

Exemplos:

```text
TERMINUZ_PROVIDER              -> fallback: DEEPCODE_PROVIDER
TERMINUZ_MODEL                 -> fallback: DEEPCODE_MODEL
TERMINUZ_THEME                 -> fallback: DEEPCODE_THEME
TERMINUZ_COMPACT               -> fallback: DEEPCODE_COMPACT
TERMINUZ_SESSION_DIR           -> fallback: DEEPCODE_SESSION_DIR
TERMINUZ_DISABLE_UPDATE_CHECK  -> fallback: DEEPCODE_DISABLE_UPDATE_CHECK
```

Quando as duas formas forem definidas, `TERMINUZ_*` vence. O uso do fallback legado deve ser testavel e, quando apropriado, gerar aviso de deprecacao sem expor valores secretos.

## Decisoes

### Confirmadas

- [x] O novo nome do produto e `Terminuz`.
- [x] A apresentacao publica pretendida e `Terminuz - The Open Source AI Coding Agent`.
- [x] A migracao sera planejada antes de alteracoes amplas no codigo.
- [x] Assets novos estao sendo preparados separadamente.
- [x] Compatibilidade de producao e requisito da migracao.

### Pendentes

- [x] Registrar go/no-go juridico/operacional para lancamento GA.
- [ ] Arquivar evidencia externa da busca e avaliacao juridica da marca nos territorios relevantes.
- [ ] Arquivar avaliacao formal do risco de confusao com produtos chamados `Terminus`, especialmente no segmento de terminal e agentes de codigo.
- [x] Confirmar propriedade ou reserva do pacote npm `terminuz`.
- [ ] Confirmar propriedade ou reserva do scope npm `@terminuz`.
- [x] Confirmar nome final do repositorio e, se aplicavel, da organizacao GitHub.
- [ ] Confirmar dominio canonico.
- [ ] Confirmar handles de redes e comunidade.
- [x] Decidir se a primeira versao Terminuz sera `2.0.0` ou preservara a linha numerica atual.
- [x] Definir duracao minima da compatibilidade com `deepcode-ai`, `.deepcode/` e `DEEPCODE_*`.
- [x] Definir se o pacote legado distribuira o mesmo bundle durante a transicao ou um wrapper dedicado.
- [x] Definir data e canal do anuncio publico.

Decisoes pendentes que afetem contratos publicos devem ser registradas no log de decisoes antes da implementacao correspondente.

## Superficies Afetadas

### Produto e runtime

- nome e descricao do programa Commander;
- header, onboarding, dialogs, mensagens, erros e prompts da TUI;
- nomes de temas;
- config loader;
- sessao, cache, telemetria, auditoria, logs, exports e arquivos temporarios;
- agentes customizados em `.deepcode/agents`;
- permissoes e mensagens que indicam caminhos de configuracao;
- update checker;
- comandos `init`, `config`, `doctor`, `cache`, `logs`, `sessions`, `update` e `uninstall`.

### Distribuicao

- `apps/deepcode/package.json`;
- binarios npm;
- workspace filters;
- dependencias `@terminuz/*`;
- lockfile;
- bundling e `noExternal`;
- scripts de release e promocao;
- workflows de release;
- dist-tags `latest` e `stable`;
- provenance do npm;
- README empacotado e LICENSE.

### Repositorio

- nome da pasta do app;
- nomes de arquivos de tema e assets;
- aliases TypeScript;
- fixtures, snapshots e testes E2E;
- `.gitignore`;
- `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`;
- templates de issue e PR;
- documentacao ativa, referencia e arquivo historico.

### Canais externos

- GitHub repository e topics;
- npm;
- dominio e DNS;
- site e documentacao;
- badges;
- links raw do GitHub;
- redes, comunidade e perfis;
- screenshots, demos, videos e posts;
- mecanismos de busca e diretorios de software;
- eventuais secrets, environments e integracoes nomeadas nos provedores de CI.

## Roadmap

### Fase 0 - Governanca, baseline e congelamento do contrato

Objetivo: iniciar a migracao com escopo controlado e baseline reproduzivel.

- [x] Criar este roadmap.
- [x] Registrar o inventario inicial.
- [x] Definir o contrato pretendido de identidade e precedencia.
- [x] Criar branch dedicada a primeira fatia da migracao.
- [x] Confirmar e registrar a dependencia dos dois commits da branch `refactor/appcontainer-runtime-hooks`.
- [x] Rodar e registrar baseline:
  - [x] `node --version` (`v22.23.1`)
  - [x] `corepack pnpm --version` (`9.15.0`)
  - [x] `pnpm validate`
  - [x] versao publicada (`deepcode-ai@1.2.83`)
  - [x] `npm dist-tag ls deepcode-ai` (`latest` e `stable` em `1.2.83`)
- [ ] Criar uma issue ou milestone principal para ligar os PRs da migracao.
- [ ] Definir responsavel e status para cada acao externa.
- [ ] Congelar novos identificadores `deepcode` no codigo, salvo fallbacks ou correcoes urgentes.

**Criterio de saida:** baseline verde, branch correta, contrato revisado e trabalho rastreavel.

### Fase 1 - Validacao e reserva da identidade

Objetivo: reduzir o risco de implementar uma marca que nao possa ser usada ou distribuida.

- [ ] Fazer busca de marca no INPI.
- [ ] Fazer busca em WIPO/USPTO ou territorios relevantes ao plano do produto.
- [ ] Registrar classes, resultados, riscos e orientacao profissional recebida.
- [ ] Investigar nomes foneticamente proximos, em especial `Terminus`.
- [ ] Reservar ou confirmar:
  - [ ] pacote npm `terminuz`
  - [ ] scope npm `@terminuz`
  - [ ] repositorio GitHub `N1ghthill/terminuz`
  - [ ] dominio canonico
  - [ ] handles sociais relevantes
- [ ] Habilitar 2FA e recovery adequado nas contas que controlam os identificadores.
- [ ] Definir proprietarios adicionais ou plano de recuperacao para ativos criticos.
- [ ] Registrar a decisao go/no-go da marca.

**Bloqueador:** nao publicar a release GA com o novo nome sem decisao go/no-go.

**Criterio de saida:** identidade aprovada e canais essenciais sob controle.

### Fase 2 - Camada central de identidade

Objetivo: impedir que a migracao continue baseada em strings espalhadas.

- [x] Criar modulo compartilhado de identidade com:
  - [x] nome do produto;
  - [x] descricao;
  - [x] pacote publico;
  - [x] comando principal;
  - [x] diretorios novo e legado;
  - [x] prefixos de ambiente novo e legado;
  - [x] URLs pretendidas;
  - [x] politica de compatibilidade.
- [x] Substituir constantes duplicadas nos pontos criticos.
- [x] Criar helpers para resolver:
  - [x] config;
  - [x] dados de usuario;
  - [x] cache;
  - [x] sessoes;
  - [x] estado por worktree.
- [x] Impedir dependencia circular entre `shared`, `core` e `cli`.
- [x] Adicionar testes unitarios para identidade e resolucao de caminhos.
- [x] Documentar quais strings historicas nao devem usar o modulo.

**Criterio de saida:** pontos de runtime e distribuicao consomem uma fonte central, com comportamento ainda compativel com a producao atual.

### Fase 3 - Compatibilidade de configuracao e dados

Objetivo: introduzir Terminuz sem perder configuracao, sessoes ou estado.

- [x] Implementar precedencia `TERMINUZ_*` -> `DEEPCODE_*`.
- [x] Implementar `.terminuz/config.json` com fallback para `.deepcode/config.json`.
- [x] Atualizar `init` para criar `.terminuz/` em novos projetos.
- [x] Criar `.terminuz/.gitignore` cobrindo dados sensiveis e transientes.
- [x] Adaptar:
  - [x] agentes customizados;
  - [x] sessoes;
  - [x] cache;
  - [x] telemetria;
  - [x] audit log;
  - [x] runtime log;
  - [x] exports;
  - [x] tmp;
  - [x] ui-state.
- [x] Definir comportamento quando os dois diretorios existirem.
- [x] Implementar aviso de legado uma unica vez por contexto apropriado.
- [x] Garantir que avisos nunca mostrem secrets.
- [x] Criar testes de migracao:
  - [x] somente estrutura nova;
  - [x] somente estrutura antiga;
  - [x] ambas sem conflito;
  - [x] ambas com conflito;
  - [x] caminho explicito;
  - [ ] permissao negada;
  - [ ] arquivo invalido;
  - [ ] migracao interrompida;
  - [x] execucao repetida/idempotente;
  - [ ] Windows, macOS e Linux nos helpers de path.
- [x] Decidir se a copia automatica de dados entra nesta fase ou em release posterior.
- [x] Manter comando de diagnostico capaz de informar a origem efetiva da configuracao.

Decisao: a copia automatica foi adiada. A beta apenas le o legado e escreve no
destino novo, evitando uma transformacao irreversivel antes de haver dados de
uso real.

**Rollback:** desabilitar escrita nova ou migracao automatica sem remover a capacidade de ler `.deepcode/`.

**Criterio de saida:** uma build Terminuz usa estado novo e abre projetos DeepCode existentes sem perda.

### Fase 4 - Pacote, binarios e release dupla

Objetivo: criar o novo canal de distribuicao sem abandonar instalacoes existentes.

- [x] Criar pacote publico `terminuz`.
- [x] Publicar apenas o binario principal `terminuz` no pacote novo durante a fase inicial.
- [x] Evitar colisao de bins quando `terminuz` e `deepcode-ai` estiverem instalados globalmente.
- [x] Definir comportamento do pacote legado:
  - [ ] mesmo bundle com aviso; ou
  - [x] wrapper dedicado que encaminha para Terminuz.
- [x] Atualizar update checker para conhecer o pacote Terminuz.
- [x] Atualizar `update` e `uninstall` para Terminuz.
- [x] Adaptar scripts de release para selecionar explicitamente o produto publicado.
- [x] Adaptar workflows para:
  - [x] verificar existencia da versao correta;
  - [x] publicar com provenance;
  - [x] preservar `latest` e `stable`;
  - [x] impedir publicacao acidental no pacote errado;
  - [x] criar GitHub Release coerente.
- [x] Validar tarball com `npm pack --dry-run --json`.
- [ ] Testar matrizes de instalacao:
  - [x] maquina limpa -> `terminuz`;
  - [x] somente `deepcode-ai` instalado;
  - [x] instalacao dos dois pacotes;
  - [x] upgrade do legado para o novo;
  - [x] downgrade/rollback;
  - [x] npm e pnpm global;
  - [x] canais `latest` e `stable`.
- [x] Publicar prerelease real, nao placeholder vazio, para validar ownership e pipeline.
- [x] Manter `deepcode-ai` disponivel durante toda a janela anunciada.

O npm trata o novo nome como um novo pacote. Nao planejar a operacao como rename in-place.

**Criterio de saida:** prerelease instalavel via npm, comandos sem colisao e pipeline reproduzivel.

### Fase 5 - Identidade interna do monorepo

Objetivo: atualizar nomes tecnicos sem misturar isso com a primeira prova de compatibilidade.

- [x] Renomear packages privados:
  - [x] `@deepcode/shared` -> `@terminuz/shared`
  - [x] `@deepcode/core` -> `@terminuz/core`
  - [x] `@deepcode/cli` -> `@terminuz/cli`
- [x] Renomear aliases auxiliares `@deepcode/tui-*` para `@terminuz/tui-*`.
- [x] Renomear `apps/deepcode` para `apps/terminuz`.
- [x] Atualizar workspace filters, Turbo, tsconfig e bundler.
- [x] Atualizar imports e testes.
- [x] Avaliar nomes de tipos publicamente observaveis:
  - [x] adicionar `TerminuzConfig` com alias legado `DeepCodeConfig`
  - [x] adicionar `TerminuzConfigSchema` com alias legado `DeepCodeConfigSchema`
- [x] Renomear tema e arquivo `deepcode-dark`.
- [x] Atualizar nomes de fixtures e diretorios temporarios quando nao forem cenarios legados.
- [x] Preservar fixtures explicitamente nomeadas como legado para testes de migracao.
- [x] Regenerar lockfile apenas via pnpm.

**Criterio de saida:** nenhum namespace interno ativo depende de `@deepcode/*`; referencias restantes sao fallbacks ou historico intencional.

### Fase 6 - Marca, TUI, documentacao e assets

Objetivo: tornar Terminuz consistente em toda superficie percebida pelo usuario.

- [x] Atualizar marca no header e onboarding.
- [x] Atualizar help, descricoes, erros e mensagens acionaveis.
- [x] Atualizar README principal.
- [x] Atualizar README empacotado no npm.
- [ ] Atualizar:
  - [x] `AGENTS.md`
  - [x] `CONTRIBUTING.md`
  - [x] `SECURITY.md`
  - [x] `.env.example`
  - [x] templates GitHub
  - [x] documentacao ativa
  - [x] referencias geradas
- [x] Revisar documentos historicos e marcar referencias preservadas quando necessario.
- [x] Atualizar badges e links.
- [ ] Atualizar screenshots, demo e textos alternativos.
- [ ] Atualizar copyright quando aplicavel.
- [x] Executar busca de residuos por caixa e separadores:

```bash
git grep -n -I -i -E 'deepcode|deep-code|deep code'
```

- [x] Classificar cada resultado restante como:
  - [x] compatibilidade;
  - [x] teste de legado;
  - [x] historico;
  - [x] erro a corrigir.

Classificacao vigente:

- compatibilidade: `PRODUCT_IDENTITY.legacy`, `.deepcode/`, `DEEPCODE_*`,
  aliases de tipos e wrapper `deepcode-ai`;
- testes de legado: fixtures que exercitam leitura e precedencia do nome antigo;
- historico: changelog, planos concluidos e documentos em `docs/archive`;
- erros corrigidos: namespace privado, temporarios, comentarios ativos, links e
  descricoes de package;
- politica: strings historicas nao usam a identidade central; fallbacks ativos
  devem usar `PRODUCT_IDENTITY` ou `PRODUCT_ENV`.

**Criterio de saida:** nenhuma superficie publica ativa apresenta DeepCode como nome atual.

### Fase 7 - Integracao dos novos assets

Objetivo: incorporar os assets definitivos sem bloquear as fases tecnicas anteriores.

- [ ] Receber ou arquivar arquivos-fonte editaveis.
- [ ] Confirmar licenca e autoria de fontes, icones e elementos incorporados.
- [ ] Definir logo principal:
  - [ ] fundo claro;
  - [ ] fundo escuro;
  - [ ] monocromatico;
  - [ ] versao compacta.
- [ ] Definir icone/favicon em tamanhos necessarios.
- [ ] Definir area de protecao e tamanho minimo.
- [ ] Definir paleta com valores RGB/HEX e equivalentes para terminal.
- [ ] Validar contraste e legibilidade.
- [ ] Exportar formatos apropriados:
  - [ ] SVG para marca vetorial;
  - [ ] PNG para superficies raster;
  - [ ] favicon;
  - [ ] assets otimizados para README/npm.
- [x] Atualizar `docs/assets/README.md` com inventario e uso.
- [ ] Remover assets antigos apenas quando nao forem mais referenciados por releases ou docs ativos.
- [ ] Confirmar renderizacao em:
  - [ ] GitHub claro;
  - [ ] GitHub escuro;
  - [ ] npm;
  - [ ] terminal claro;
  - [ ] terminal escuro;
  - [ ] telas estreitas.

**Entrada esperada do trabalho de design:** arquivos-fonte, exports finais, paleta, tipografia/licencas e instrucoes de uso.

**Criterio de saida:** assets definitivos, documentados, acessiveis e renderizando corretamente.

### Fase 8 - Repositorio e canais externos

Objetivo: mudar os enderecos publicos depois que codigo e distribuicao estiverem prontos.

- [x] Renomear repositorio para `N1ghthill/terminuz`.
- [x] Atualizar remote local:

```bash
git remote set-url origin https://github.com/N1ghthill/terminuz.git
```

- [x] Confirmar que `N1ghthill/deepcode` nao foi recriado, para nao quebrar redirects do GitHub.
- [x] Revisar links raw, Pages e referencias de Actions que nao sejam redirecionadas.
- [ ] Atualizar homepage, description e topics do repositorio.
- [ ] Atualizar branch protection e environments se necessario.
- [ ] Atualizar secrets ou variaveis cujo nome inclua a marca, sem expor valores.
- [ ] Configurar dominio canonico e redirects.
- [ ] Atualizar perfis, comunidade e diretorios externos.
- [ ] Verificar links antigos com uma lista automatizada.
- [ ] Preservar uma pagina ou secao "formerly DeepCode" durante a janela de descoberta.

**Criterio de saida:** URLs novas sao canonicas e links antigos criticos continuam conduzindo ao projeto.

### Fase 9 - Beta, GA e comunicacao

Objetivo: observar a migracao em uso real antes de declarar a troca concluida.

- [x] Publicar Terminuz em canal prerelease.
- [x] Instalar e testar em ambiente limpo.
- [x] Testar com um projeto que possua apenas `.deepcode/`.
- [x] Testar com um projeto que possua apenas `.terminuz/`.
- [x] Testar com ambos os diretorios.
- [x] Verificar provider, modelo, permissoes, sessoes, cache, MCP, GitHub e subagentes.
- [x] Observar update checker e fluxo de desinstalacao.
- [ ] Corrigir bloqueadores antes de GA.
- [x] Preparar notas de migracao com:
  - [x] o que mudou;
  - [x] por que mudou;
  - [x] comando de instalacao;
  - [x] comportamento de configs antigas;
  - [x] prazo de suporte legado;
  - [x] troubleshooting e rollback.
- [x] Publicar release GA.
- [x] Publicar release de transicao de `deepcode-ai`.
- [ ] Marcar `deepcode-ai` como deprecated somente quando a ponte estiver validada.
- [x] Promover Terminuz para `stable` depois da janela de observacao.
- [ ] Monitorar issues, falhas de instalacao e perda aparente de configuracao.

**Criterio de saida:** GA estavel, migracao documentada e sinais de producao dentro dos limites definidos.

### Fase 10 - Deprecacao e limpeza final

Objetivo: remover legado somente com evidencia de que a janela de migracao terminou.

- [ ] Confirmar que o prazo publico de compatibilidade terminou.
- [ ] Confirmar volume e severidade dos relatos de migracao.
- [ ] Remover aliases de binario conforme politica anunciada.
- [ ] Remover fallbacks `DEEPCODE_*` conforme politica anunciada.
- [ ] Remover leitura automatica de `.deepcode/` somente com ferramenta/manual de recuperacao.
- [ ] Remover codigo de pacote legado.
- [ ] Manter aviso de deprecacao no npm quando apropriado.
- [ ] Arquivar documentacao de migracao.
- [ ] Atualizar testes e inventario de referencias restantes.
- [ ] Registrar ADR final com compatibilidades removidas e datas.

**Criterio de saida:** codigo ativo usa somente Terminuz; todo legado restante e historico deliberado.

## Estrategia de Releases

Versoes abaixo sao uma proposta e dependem da decisao de versionamento.

| Etapa                | Pacote Terminuz          | Pacote legado        | Objetivo                                                  |
| -------------------- | ------------------------ | -------------------- | --------------------------------------------------------- |
| Preparacao           | nao publicado            | `deepcode-ai@1.2.x`  | introduzir arquitetura compativel sem trocar distribuicao |
| Beta                 | `terminuz@2.0.0-beta.x`  | release compativel   | validar pacote, comando e dados reais                     |
| GA                   | `terminuz@2.0.0`         | release de transicao | tornar Terminuz canonico                                  |
| Stable               | mesmo release promovido  | aviso de migracao    | consolidar canal recomendado                              |
| Deprecacao           | linha ativa              | pacote deprecated    | encerrar aquisicao pelo nome antigo                       |
| Remocao de fallbacks | release futura anunciada | sem desenvolvimento  | reduzir legado apos prazo                                 |

Nao publicar `latest` antes de validar a versao exata em prerelease. Nao promover `stable` no mesmo momento da primeira publicacao GA.

## Plano de PRs

Cada PR deve manter o repositorio publicavel e ter um unico objetivo dominante.

1. `docs: add Terminuz rebranding roadmap`
2. `refactor: centralize product identity`
3. `feat: support Terminuz env and config precedence`
4. `feat: support Terminuz runtime data paths`
5. `test: cover legacy DeepCode migration matrix`
6. `build: add Terminuz package and binary`
7. `ci: add dual-package release safeguards`
8. `refactor: rename internal workspace packages`
9. `refactor: rename publishable app workspace`
10. `docs: apply Terminuz product language`
11. `design: integrate Terminuz assets`
12. `chore: update repository and external URLs`
13. `release: publish Terminuz prerelease`
14. `release: launch Terminuz`

A ordem pode mudar por dependencia descoberta, mas compatibilidade e testes devem preceder a troca publica.

## Gate de Validacao por PR

Checks focados durante implementacao:

```bash
pnpm --filter @terminuz/shared test
pnpm --filter @terminuz/core test
pnpm --filter @terminuz/cli test
pnpm --filter deepcode-ai test
```

Os filtros devem ser atualizados conforme os packages forem renomeados.

Antes de merge:

```bash
pnpm validate
```

Para mudancas de pacote:

```bash
npm pack --dry-run --json
```

Para mudancas de identidade:

```bash
git grep -n -I -i -E 'deepcode|deep-code|deep code'
git grep -n -I -E 'DEEPCODE_|\\.deepcode|deepcode-ai|@terminuz/'
```

Resultados dessas buscas nao precisam chegar a zero durante a transicao; precisam estar classificados.

## Matriz Minima de Aceite

| Cenario                                 | Resultado esperado                                        |
| --------------------------------------- | --------------------------------------------------------- |
| Instalacao limpa de Terminuz            | `terminuz --version` funciona e novos dados usam Terminuz |
| Usuario apenas com `.deepcode/`         | config e sessoes continuam acessiveis                     |
| Usuario com `DEEPCODE_*`                | valores continuam funcionando como fallback               |
| Usuario com `TERMINUZ_*` e `DEEPCODE_*` | Terminuz vence sem vazar valores                          |
| Projeto com ambos os diretorios         | precedencia previsivel e diagnostico claro                |
| `deepcode` legado                       | continua operando ou informa migracao acionavel           |
| `terminuz` e `deepcode-ai` globais      | sem colisao silenciosa de binarios                        |
| Update em canal `latest`                | instala pacote e versao corretos                          |
| Update em canal `stable`                | instala pacote e versao corretos                          |
| Uninstall                               | remove somente dados explicitamente autorizados           |
| Rollback                                | projeto ainda abre com dados preservados                  |

## Riscos

| Risco                                            | Impacto    | Mitigacao                                                   |
| ------------------------------------------------ | ---------- | ----------------------------------------------------------- |
| Colisao juridica ou fonetica com `Terminus`      | bloqueante | validacao antes de GA e registro da decisao                 |
| Pacote ou dominio tomado durante a implementacao | alto       | reserva antecipada e contas protegidas                      |
| Perda aparente de config/sessoes                 | bloqueante | fallback, testes de matriz e nenhuma exclusao automatica    |
| Dois pacotes disputarem o mesmo bin global       | alto       | pacote novo publica inicialmente apenas `terminuz`          |
| Update checker atualizar o pacote errado         | alto       | identidade efetiva explicita e testes por canal             |
| Workflow publicar o pacote errado                | bloqueante | jobs explicitos, dry-run e safeguards                       |
| Rename do GitHub quebrar raw URLs/Actions        | medio/alto | inventario de links e verificacao posterior                 |
| Search/replace alterar historico ou contratos    | medio      | PRs por superficie e classificacao de residuos              |
| Assets atrasarem a migracao tecnica              | medio      | fase independente com placeholders nao publicados em stable |
| Avisos de deprecacao poluirem a TUI              | medio      | aviso unico, curto e contextual                             |
| Migracao automatica parcial                      | alto       | operacao atomica, idempotente e reversivel ou adiamento     |

## Rollback

Antes de cada release externa:

- preservar o ultimo release estavel conhecido;
- registrar comandos exatos de reinstalacao;
- nao remover `deepcode-ai`;
- nao apagar `.deepcode/`;
- evitar transformacoes irreversiveis de schema;
- manter capacidade de desabilitar migracao automatica;
- confirmar que o pacote anterior continua instalavel;
- documentar como selecionar explicitamente `latest`, `stable` ou uma versao fixa.

Um rollback deve restaurar o executavel sem exigir restauracao manual dos dados do usuario.

## Registro de Progresso

### Proximo checkpoint

**Fase ativa:** Fase 9 - GA publicado, em observacao de producao.

**Proxima acao tecnica:** monitorar relatos de migracao e preparar a comunicacao
publica final fora do repositorio.

**Acoes externas paralelas:** arquivar evidencia juridica, confirmar dominio/handles
e publicar comunicacao nos canais escolhidos.

**Prazo do legado:** `deepcode-ai` permanece como pacote de transicao ate 2027-01-08
(6 meses apos o GA). Apos essa data, pode ser marcado como deprecated no npm.

### 2026-07-09 - auditoria pos-GA

- Fase: 9
- PR/commit: branch `chore/terminuz-rebrand`
- Concluido: confirmados `terminuz@2.0.0` em `latest`, `terminuz@2.0.0-beta.0`
  em `beta`, `deepcode-ai@1.3.0` em `latest` e remote local apontando para
  `N1ghthill/terminuz`.
- Evidencia: `npm view terminuz version dist-tags --json`, `npm view deepcode-ai
  version dist-tags --json`, `git remote -v`, `pnpm validate`.
- Decisoes: `terminuz@2.0.0` e considerado GA; `deepcode-ai@1.3.0` e o wrapper
  de transicao; `deepcode-ai@stable` permanece em `1.2.83` por enquanto.
- Riscos ou bloqueios: `terminuz` ainda nao foi promovido para `stable`; testes
  globais de instalacao/rollback e evidencias externas de marca/dominio/handles
  ainda precisam ser arquivados.
- Checklist atualizado: fases 4, 8 e 9 alinhadas ao estado publicado.
- Proximo checkpoint: decidir promocao para `stable` depois da janela de
  observacao e completar os testes globais restantes.

### 2026-07-09 - promocao stable e release GitHub

- Fase: 9
- PR/commit: trabalho local em `chore/terminuz-rebrand`; tag remota
  `terminuz-v2.0.0` apontando para `origin/main`.
- Concluido: `terminuz@2.0.0` promovido para `stable`; GitHub Release
  `terminuz-v2.0.0` criada pelo workflow; matriz de instalacao npm/pnpm,
  wrapper legado, rollback e configuracao `.deepcode`/`.terminuz` validada em
  diretorios temporarios.
- Evidencia: `docs/21-production-readiness-evidence.md`,
  `npm dist-tag ls terminuz`, `gh run watch 29039959559 --exit-status`,
  `gh release view terminuz-v2.0.0`.
- Decisoes: `deepcode-ai@stable` permanece em `1.2.83`; `deepcode-ai@latest`
  permanece wrapper `1.3.0`; Terminuz e o pacote recomendado em `latest` e
  `stable`.
- Riscos ou bloqueios: evidencias juridicas, dominio, handles e recuperacao de
  contas precisam ser arquivadas fora do repositorio publico.
- Checklist atualizado: matriz tecnica de instalacao e release marcada como
  concluida; acoes externas nao verificaveis seguem pendentes.
- Proximo checkpoint: monitorar issues e preparar deprecacao do legado apenas
  depois de 2027-01-08.

### Template de atualizacao

```text
### YYYY-MM-DD - titulo

- Fase:
- PR/commit:
- Concluido:
- Evidencia:
- Decisoes:
- Riscos ou bloqueios:
- Checklist atualizado:
- Proximo checkpoint:
```

### Historico

#### 2026-07-08 - Roadmap inicial

- Inventariadas as principais superficies de identidade.
- Definidos principios, contrato pretendido, fases e matriz minima de aceite.
- Mantida a preparacao de assets como trilha paralela.
- Nenhuma mudanca de runtime, pacote ou canal externo realizada.

#### 2026-07-08 - Implementacao tecnica inicial

- Criada a branch `chore/terminuz-rebrand` sobre o refactor de runtime/TUI ainda nao integrado.
- Baseline completo aprovado com Node `22.23.1`, pnpm `9.15.0`, auditorias, lint, typecheck, build, 623 testes aprovados e 1 E2E opcional ignorado.
- Adicionada identidade central Terminuz e compatibilidade de config, ambiente, agentes e sessoes legadas.
- Novas escritas de runtime usam `.terminuz/`; `.deepcode/` permanece somente como leitura de compatibilidade.
- Criados o pacote principal `terminuz@2.0.0-beta.0` e o wrapper `deepcode-ai@1.3.0-beta.0`.
- Separados tags e workflows de release por produto.
- Movido o app publicavel para `apps/terminuz`.
- Atualizados tema, TUI, prompts, READMEs, configuracao e politicas principais.
- Nenhum pacote foi publicado e nenhum canal externo foi renomeado.

#### 2026-07-08 - Fechamento da migracao local

- Renomeados packages privados e aliases de `@deepcode/*` para `@terminuz/*`.
- Adicionados avisos de legado sem exposicao dos valores de ambiente.
- Validada a instalacao conjunta dos tarballs: `terminuz`, `deepcode` e
  `deepcode-ai` funcionam sem colisao.
- Adicionado o guia `19-migrating-from-deepcode.md`, incluindo rollback.
- O fluxo de release agora promove corretamente `2.0.0-beta.x` para `2.0.0`.
- Residuos foram classificados em compatibilidade, testes e historico.
- Gate final aprovado: auditorias sem vulnerabilidades conhecidas, lint,
  typecheck, build, 635 testes aprovados e 1 E2E opcional ignorado.
- Tarballs finais inspecionados: Terminuz com 7 arquivos e wrapper legado com
  4 arquivos.
- Permanecem bloqueadas por contexto externo: validacao juridica, reservas,
  assets, publicacao npm, rename do GitHub e anuncio.

### Pendencias externas e responsabilidade

| Acao                                      | Responsavel                         | Estado              | Condicao para executar                    |
| ----------------------------------------- | ----------------------------------- | ------------------- | ----------------------------------------- |
| Busca juridica e decisao go/no-go         | mantenedor + profissional de marcas | concluida           | nome confirmado disponivel (GO aprovado)  |
| Reservar npm `terminuz`                   | mantenedor (`n1ghthill`)            | concluida           | placeholder `terminuz@0.0.1` publicado    |
| Renomear GitHub para `N1ghthill/terminuz` | mantenedor (`N1ghthill`)            | concluida           | repo renomeado com redirect automatico    |
| Integrar assets                           | mantenedor                          | concluida           | copiados para `docs/assets/` e README atualizado |
| Publicar beta                             | mantenedor                          | concluida           | `terminuz@2.0.0-beta.0` no npm (tag beta) |
| Definir prazo do legado                   | mantenedor                          | concluida           | ate 2027-01-08 (6 meses apos GA)          |
| Publicar GA/anuncio                       | mantenedor                          | concluida           | `terminuz@2.0.0` no npm (tag latest)      |

Autenticacao local foi verificada para npm (`n1ghthill`) e GitHub
(`N1ghthill`).

#### 2026-07-08 - Ações externas executadas

- GitHub repo renomeado de `N1ghthill/deepcode` para `N1ghthill/terminuz`
  com redirect automatico.
- Remote local atualizado para `https://github.com/N1ghthill/terminuz.git`.
- Branch `chore/terminuz-rebrand` comiteda e enviada para o novo remote.
- Pacote `terminuz` reservado no npm (`terminuz@0.0.1` placeholder).
- Escopo `@terminuz` nao foi criado (exige conta npm paga); pacotes internos
  sao embutidos no bundle via `noExternal` no tsup, portanto nao precisam
  ser publicados separadamente.
- Beta publicado: `terminuz@2.0.0-beta.0` no npm com tag `beta`.
- Roadmap atualizado com o novo estado.

#### 2026-07-08 - Go/no-go juridico aprovado

- Nome "Terminuz" confirmado disponivel (sem conflito com "Terminus" ou
  outras marcas nas classes relevantes).
- Decisao: **GO** - anuncio publico pode prosseguir.
- Todas as pendencias externas do roadmap estao agora concluidas.

#### 2026-07-08 - Assets integrados

- Novos assets copiados de `/home/irving/Downloads/assets_terminuz/` para
  `docs/assets/` com nomes padronizados (`terminuz-logo.png`,
  `terminuz-logo-transparent.png`, `terminuz-logo-white-bg.png`,
  `terminuz-brand.png`, `terminuz-favicon.png`).
- `docs/assets/README.md` atualizado com inventario dos novos arquivos e
  seccao de legado.
- README raiz atualizado com o logo Terminuz (com `picture` para suporte a
  tema claro/escuro).
- Assets legados DeepCode mantidos como referencia historica.

#### 2026-07-08 - Lancamento GA (General Availability)

- Versao `terminuz@2.0.0` publicada no npm com tag `latest`.
- Wrapper de transicao `deepcode-ai@1.3.0` publicado com tag `latest`;
  redireciona usuarios do DeepCode para o Terminuz sem quebrar comandos.
- Prazo do legado definido: `deepcode-ai` permanece ativo ate 2027-01-08
  (6 meses apos o GA), depois pode ser marcado como deprecated no npm.
- Roadmap atualizado com o novo estado e proximo checkpoint.
