# 15 - Handoff e Próximos Passos

> Documento interno de engenharia. Não use este arquivo como resumo oficial do produto; a superfície pública do repositório está em `README.md`, `docs/README.md`, `CONTRIBUTING.md` e `SECURITY.md`.

## Estado Atual

Última rodada validada: `main` commitado e publicado no npm, validado em 2026-05-18.

Versão publicada: **`deepcode-ai@1.1.26`** em https://www.npmjs.com/package/deepcode-ai

## Estrutura do Monorepo

- `packages/shared`: schemas e tipos compartilhados.
- `packages/core`: providers, agente, ferramentas, segurança, GitHub, LSP, cache, workflows e subagents.
- `packages/cli`: comandos CLI e TUI (Ink 7 / React 19).
- `apps/deepcode`: pacote executável `deepcode-ai` publicado no npm.

## Validação Atual

```bash
pnpm typecheck   # 0 erros em 4 pacotes
pnpm lint
pnpm test        # 233 testes, 232 passando, 1 skip condicional
pnpm build
```

## Funcionalidades Implementadas

### CLI

- `init`, `chat`, `run`, `review`, `doctor`, `cache clear`, `projects`.
- Config: `config path`, `config show`, `config get`, `config set`, `config unset`.
- GitHub: `github login`, `github whoami`, `github issues`, `github pr`, `github solve`, `github prs`, `github merge`, `github review`.
- Subagents: `subagents run --task ...`.

### Providers

- Anthropic, OpenAI, OpenRouter, DeepSeek, OpenCode, Groq, Ollama.
- Tool calling com agregação de argumentos em streaming (OpenAI-compatible e Anthropic).
- Failover com modelo por provider, skip de providers sem credenciais.
- 429/503 retry com backoff configurável.

### Agent

- Modos PLAN e BUILD.
- Context window management com auto-sumarização.
- Token budget enforcement com `budget:warning` e `budget:exceeded`.
- Situational awareness: saudações e small-talk tratados localmente.
- Subagent orchestration completo via ferramenta `task`:
  - Parâmetros: `prompt`, `subagent_type`, `provider`, `model`, `fork`.
  - Named agents: `.deepcode/agents/*.md` com frontmatter YAML (name, description, model, allowed_tools, disallowed_tools).
  - Override de system prompt e filtro de ferramentas por agente nomeado.
  - Eventos `subagent:start`, `subagent:tool`, `subagent:complete` no EventBus.
  - Painel `SubagentsPanel` na TUI com status em tempo real (⏳/✓/✗) e ferramenta atual.
- Workflows: `ChainWorkflow`, `ParallelWorkflow`, `EvaluatorOptimizerWorkflow`.

### Ferramentas

- `read_file`, `write_file`, `edit_file`, `list_dir`.
- `search_text`, `search_files`, `search_symbols` via LSP + fallback heurístico.
- `bash`, `git`, `analyze_code`, `lint`, `test`.
- `fetch_web`.
- MCP client via stdio (JSON-RPC 2.0).

### Segurança

- Path whitelist/blacklist, permission gateway, audit log.
- Classificação de shell em `shell`, `dangerous`, `blocked`.
- Mascaramento centralizado de secrets em streaming e erros.

### TUI (Ink 7 / React 19)

- Input com autocomplete, modo Vim (normal/insert), paste seguro.
- Slash commands: `/help`, `/clear`, `/undo`, `/diff`, `/provider`, `/model`, `/mode`, `/rename`, `/compact`, `/sessions`, `/settings`, `/theme`, `/permissions`, `/auth`.
  - `/undo` funcional: restaura o último arquivo escrito/editado pelo agente (LIFO); deleta se o arquivo era novo.
  - `/compact`: sumariza a conversa via LLM, substitui histórico pelo resumo, persiste sessão compactada.
  - `/rename <name>`: renomeia a sessão atual; nome armazenado em `session.metadata.name`.
  - `/sessions`: abre `SessionsDialog` inline para restaurar sessão sem sair da TUI.
- Model picker interativo (`/model` ou `Ctrl+P` para provider) com busca, seção Recent e grupos por provider, badge de latência.
- Provider dialog com submenu, teste de conectividade e latência ao vivo.
- ThemeDialog com preview ao vivo; PermissionsDialog; AuthDialog com device flow OAuth inline.
- Painel de aprovação detalhado com fila e Enter para aprovar.
- TaskPlanPanel com status por task (modo PLAN).
- Tool cards com atividade por tipo (read, write, bash, git, search, test, lint).
- Redaction de secrets em streaming e erros.
- `deepcode projects`: browser interativo de repos git descobertos no home.
- Footer: `MCPHealthPill` mostra `MCP n/m` quando há servidores MCP configurados.
- Footer: `useStatusLine` mostra cwd + branch git (`~/path [branch]`) quando dentro de um repositório.
- Footer: `BackgroundTasksPill` mostra contagem de subagents rodando enquanto o `SubagentsPanel` está ativo.
- `SubagentsPanel`: painel acima do input com status por subagent (…/✓/✗); mostra ferramenta ativa (`using <tool>`), output em streaming quando o subagent está gerando texto, ou erro ao falhar; some 3 s após todos concluírem.
- `useFollowupSuggestions`: após cada turno, gera uma sugestão de follow-up via LLM (max 20 tokens); aparece como placeholder cinza no input; Tab/→ aceita, qualquer tecla descarta.
- Histórico de sessões persistente: sessão salva em `.deepcode/sessions/{id}.json` após cada turno; `deepcode sessions` abre picker com busca (`/` para buscar); `deepcode chat --resume <id>` restaura histórico.
- `deepcode sessions clear [--all] [--older-than <days>]`: limpa arquivos de sessão por idade ou todos.
- Nomes de sessão: gerado via LLM (~5 palavras) após o primeiro turno; mostrado nos pickers em vez do primeiro prompt.
- Node engine: declarado `>=22` para alinhar com Ink 7 / cli-truncate / slice-ansi.
- `deepcode review [ref]`: revisão de código local via LLM; suporta `--staged`, `--file`, `--focus`, `--provider`, `--model`; persiste sessão para follow-up com `chat --resume`.

### Infraestrutura

- Cache persistente para read/search em `.deepcode/cache`.
- OAuth GitHub via device flow real, sem client ID embutido.
- CI: lint + typecheck + test + build em PRs e push para main.
- Release: bump de versão + tag + push → GitHub Actions publica no npm com provenance.
- Stable channel: releases publicam em `@latest`; depois de validacao real, promover uma versao publicada para `@stable` com `pnpm promote-stable -- <version>` ou pelo workflow manual "Promote Stable".
- Secret scan em arquivos rastreados no CI.

## Stubs — Implementar Quando Entrar no Escopo

Estes componentes existem no código mas não fazem nada; são placeholders herdados do port da TUI do Qwen:

| Stub | Arquivo | O que seria |
|---|---|---|
| `ShellInputPrompt` | `tui/ui/components/` | Input inline dentro de tool cards |
| `MermaidDiagram` | `tui/ui/utils/` | Render de diagramas Mermaid |
| `i18n` | `tui/i18n/` | Internacionalização real (hoje é função identidade) |
| Dialog fallback | `AppContainer.tsx` | "This dialog is not implemented yet." (só aparece se um `DialogType` novo for adicionado sem renderização correspondente) |

## Checklist Antes de Dizer "Produção"

- [x] Pacote publicado no npm (`deepcode-ai@1.1.18`).
- [x] OAuth GitHub implementado.
- [x] Testes E2E cobrindo projeto fixture TypeScript e Python.
- [x] Documentação de config completa.
- [x] Editor interativo de config na TUI.
- [x] Tool `fetch_web`.
- [x] MCP client.
- [x] `doctor` passa em ambiente real com provider, modelo, GitHub token e LSP.
- [x] `run` executa pelo menos uma tarefa real com tool calls.
- [x] `chat` consegue aprovar/negar uma operação sensível pela TUI.
- [x] `github solve` validado em issue real de teste (issue #7 → PR #8).
- [x] Subagent system completo: ferramenta `task`, named agents, painel TUI em tempo real.
- [x] Subagent validado: core via `subagents run` (paralelo, sessões independentes) + `SubagentsPanel` (ciclo running→done→failed→some em smoke-test).
- [x] E2E de subagent: `SubagentManager` (eventos EventBus start/chunk/tool/complete, error path, parallel, overrides) + `loadAgentConfigs` + CLI `subagents run` com mock LLM.
- [x] `FeedbackDialog` implementado: `/feedback` abre dialog de rating 1-5, salva JSONL em `.deepcode/feedback.log`.
- [x] Histórico de sessões persistente: sessão é salva em `.deepcode/sessions/{id}.json` após cada turno; `deepcode sessions` abre picker TUI para escolher sessão; `deepcode chat --resume <id>` restaura histórico completo.
- [x] `/sessions` slash command na TUI: abre `SessionsDialog` inline (mesmo padrão do ModelDialog); ao selecionar, restaura histórico e continua o chat sem sair da TUI.
- [x] `deepcode sessions clear [--all] [--older-than <days>]`: limpa arquivos de sessão por idade ou todos de uma vez.
- [x] `deepcode run` persiste sessão após execução (além da TUI que já persistia).
- [x] E2E de session persistence: `run` → arquivo criado → `sessions clear` → arquivo removido; `--older-than` respeita sessões recentes.
- [x] `/compact` slash command: sumariza a conversa via LLM, substitui histórico pelo resumo, persiste sessão compactada.
- [x] Nomes de sessão: nome curto (~5 palavras) gerado via LLM após o primeiro turno e armazenado em `session.metadata.name`; pickers mostram o nome em vez do primeiro prompt.

## Comandos Úteis Para Retomar

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm promote-stable -- 1.1.27  # promove uma versao ja publicada para npm @stable

# Rodar via build local
node apps/deepcode/dist/index.js --help
node apps/deepcode/dist/index.js --version
node apps/deepcode/dist/index.js doctor
node apps/deepcode/dist/index.js chat
node apps/deepcode/dist/index.js sessions                  # picker de sessões salvas
node apps/deepcode/dist/index.js chat --resume <session-id> # retomar sessão
# Shell function para retomar diretamente: deepcode chat --resume "$(deepcode sessions)"

# Rodar via workspace (dev)
pnpm --filter deepcode-ai dev -- --help
```

## Riscos Conhecidos

- Tool calling real varia por provider/modelo; validar com o modelo escolhido antes de usar em projeto importante. Testado e validado com DeepSeek (deepseek-v4-flash).
- `run --yes` aprova todas as permission requests incluindo paths fora do whitelist; use sem `--yes` para manter o controle interativo.
- `github solve` com `--yes` faz branch, commit, push, PR e comentário; usar em repo/branch de teste primeiro. Validado em issue #7 (adição de `.editorconfig`) → PR #8.
- `github solve` respeita commits feitos pelo agente via tool `git`/`bash`; não faz double-commit.
- `search_symbols` depende de language servers instalados no PATH; configure `lsp.servers` no config com os servidores disponíveis na máquina.
- Cache usa TTL; para máxima atualidade rode `deepcode cache clear`.
