# OpenAI Build Week - Submission Kit

## Evidencia de uso do Codex

Terminuz foi construido primariamente com o OpenAI Codex. A evidencia local
preserva 51 sessoes de desenvolvimento, desde a criacao do repositorio em 7 de
maio de 2026. A primeira sessao inicializou o repositorio e produziu os sete
commits iniciais. Em 25 sessoes, o Codex executou 58 operacoes explicitas de
`git commit`. O historico atual permanece intacto: 406 dos 425 commits (95,5%)
usam a identidade de autor DeepCode, configurada pelo proprio Codex. O projeto
foi posteriormente renomeado de DeepCode para Terminuz sem reescrever o
historico.

## Melhoria feita com GPT-5.6

Para a Build Week, o GPT-5.6 foi usado para tornar o roteador de providers
resiliente e observavel. O roteador agora:

- ignora fallbacks sem modelo ou credencial configurados;
- aplica cooldown de 30 segundos apos falhas transitorias;
- respeita intervalos `Retry-After` maiores;
- tenta novamente o provider preferido depois do cooldown;
- registra decisoes sanitizadas como eventos `provider.route`.

O caso principal e coberto por teste automatizado: a primeira chamada recebe
`503` no provider preferido e conclui pelo fallback; a segunda ignora o destino
em cooldown; depois do intervalo indicado por `Retry-After`, o provider
preferido volta para a rota.

## Validacao

Validado em 18 de julho de 2026 com Node.js 22 e pnpm 9.15.0:

- `pnpm validate`: aprovado;
- secrets scan: aprovado;
- `pnpm audit` e `pnpm audit --prod`: nenhuma vulnerabilidade conhecida;
- lint e typecheck: aprovados nos cinco pacotes;
- testes: 649 aprovados e 2 ignorados, incluindo o smoke test Anthropic opt-in;
- build: aprovado nos cinco pacotes.

## Roteiro de demonstracao (90 segundos)

1. Apresentar o Terminuz no terminal e mostrar a selecao do provider preferido.
2. Simular uma resposta `503` no provider preferido.
3. Mostrar a resposta concluida pelo provider de fallback.
4. Executar uma segunda chamada e mostrar que o provider degradado nao e
   consultado novamente durante o cooldown.
5. Mostrar as entradas `provider.route` em `.terminuz/runtime.log`.
6. Avancar o relogio do teste e mostrar o provider preferido retornando a rota.
7. Encerrar com o resultado de `pnpm validate` e o commit da melhoria.

## Evidencia que pode ser publicada

- totais agregados de sessoes e commits;
- trecho sanitizado da primeira sessao com `git init` e os sete commits;
- `git log` mostrando a continuidade DeepCode -> Terminuz;
- teste do roteador e eventos `provider.route` sem prompts ou credenciais;
- resultado de `pnpm validate` e SHA do commit da melhoria.

Nao publicar os arquivos JSONL completos, `state_5.sqlite`, `auth.json`, prompts,
resultados integrais de ferramentas ou caminhos pessoais.

## Feedback preparado

Enviar pela interface do Codex com `/feedback`:

> Usei o GPT-5.6 para evoluir o roteador multi-provider do Terminuz. O Codex
> identificou que o failover repetia destinos degradados e podia tentar
> providers sem configuracao utilizavel. A sessao implementou filtragem por
> modelo e credencial, cooldown com suporte a Retry-After, recuperacao
> automatica, eventos provider.route e testes de regressao. O resultado e um
> failover mais rapido, observavel e seguro para uso no terminal.
