# Changelog

All notable product-facing changes to this repository are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.2.79] — 2026-06-25

### Added

- Added public DeepCode brand assets, including a social preview card for repository and release artwork.
- Added README badges for CI, npm version, npm downloads, Node.js support, and license.

### Changed

- Expanded the npm README with installation, quick start commands, and core documentation links.

## [1.2.55] — 2026-05-31

### Fixed

- TUI: streaming text for DeepSeek v4-flash (and any provider using `native` tool calling) now appears incrementally during generation instead of appearing all at once at turn-end — root cause was `contentToolCallParser` being set on the DeepSeek provider, which triggered `bufferAllContent = true` for every call with tools, delaying ALL delta content until after the LLM stream finished; for native tool-calling models the DSML buffer is unnecessary and was suppressing the streaming view entirely; fix: agent passes `streamContent: true` when `textToolFallbackEnabled = false`, provider skips buffering

## [1.2.54] — 2026-05-31

### Fixed

- TUI: streaming window now uses the full available terminal height (`terminalHeight - 4`) instead of the previous cap of 20 lines — fast models (e.g. DeepSeek v4-flash at ~2k tok/s) were generating the final response within the window but the first half was above the cap; at turn-end those hidden lines "popped in" from the top as a visible flash; with a larger window the streaming view matches the committed Static content and the transition is seamless for typical response lengths

## [1.2.53] — 2026-05-31

### Fixed

- TUI: completed tool calls no longer linger in the live panel until the next iteration boundary — only `Executing`/`Confirming` entries are rendered, so a resolved tool disappears silently as soon as it finishes; previously the `Success` entry stayed visible until `setLiveToolCalls([])` fired at the next `onIteration`, causing Ink to erase a taller dynamic area and produce a visible flash/layout jump between iterations

## [1.2.52] — 2026-05-29

### Fixed

- TUI: streaming text is now capped to the last 20 lines (bounded by `liveAreaMaxHeight`) during generation — previously the dynamic render area grew with the response, causing Ink to erase and rewrite an ever-larger block on every 40ms tick, producing a visible flash/blink; the area is now a fixed height that slides to show the latest content, and the full text appears in Static when the turn commits

## [1.2.51] — 2026-05-29

### Fixed

- TUI: split the single 40ms flush interval into two independent intervals — 40ms for text streaming only (smooth ~25fps reveal) and 100ms for tool-call activity and subagent events (matches the stable rate from v1.2.46 that prevents live-area flicker during parallel execution); a shared 40ms interval caused Ink render drops under tool load, producing larger visible chunks

## [1.2.50] — 2026-05-29

### Fixed

- TUI: deferred `refreshStatic` now fires in the same state-update batch that hides the approval prompt (`currentApprovalId` effect), eliminating a residual race where the Static area could remount while `approvalPromptVisible` was still `true`
- Runtime: "Liste meus projeto" and other singular/typo forms (`projeto`, `repositorio`) now correctly trigger `list_projects` — `PROJECT_DISCOVERY_NOUN_PATTERN` extended with `projetos?` and `repositorios?` to cover singular and plural

### Changed

- TUI streaming frame rate increased from 10fps (100ms interval) to 25fps (40ms interval) — text reveals in smaller, more frequent bursts instead of chunky 100ms dumps

## [1.2.49] — 2026-05-28

### Fixed

- TUI: approval prompt now waits 150ms before becoming visible (`APPROVAL_PROMPT_REVEAL_DELAY_MS`) — suppresses transient flashes caused by approvals that are queued and resolved before the first paint

## [1.2.48] — 2026-05-28

### Fixed

- Agent loop: when `maxIterations` is exhausted while tool calls are still pending, the TUI now shows a clear message instead of silently ending with no assistant response
- TUI: `refreshStatic()` (compact-mode Static remount) is now deferred while an approval prompt is visible — prevents the approval prompt from flashing/disappearing during a terminal repaint; the deferred remount fires immediately after the approval resolves

## [1.2.47] — 2026-05-28

### Fixed

- Compact mode: `refreshStatic()` is now debounced (300ms) so rapid tool-call merges produce a single `Static` remount instead of one full history repaint per merge event

### Changed

- tmux spinner replaced with smooth braille animation (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 100ms) instead of the old 3-dot cycle at 750ms
- Loading phrase transition: shows `...` for 300ms before swapping to the next phrase, replacing the instant text-swap at each 15s interval

## [1.2.46] — 2026-05-28

### Fixed

- TUI flicker during subagent execution: batch flush interval halved (50ms → 100ms), cutting live-area redraws from ~20fps to ~10fps
- Live tool-call panel height capped at 40% of terminal rows (8–20 lines) so large tool outputs no longer force full-screen redraws on every tick
- Token-counter animation in Composer now pauses while only subagents are running (`isReceivingContent=false`), eliminating spurious re-renders when no tokens are arriving

## [1.2.45] — 2026-05-28

### Changed

- README: demo GIF added (800×450, 12 fps) showing the interactive TUI in action
- README: fixed personal path leak in example output, updated model references to claude-sonnet-4-6 / claude-opus-4-7, removed duplicate attribution footer
- CHANGELOG: backfilled v1.2.41–v1.2.44 entries from git history
- npm keywords expanded: added llm, claude, anthropic, openai, gpt, deepseek, ollama, openrouter, mcp, multi-provider, cli
- Internal migration notes moved to docs/archive/

## [1.2.44] — 2026-05-28

### Changed

- SubagentsPanel refactored: dead render paths and unused state removed, reducing re-render surface during multi-agent runs

## [1.2.43] — 2026-05-27

### Fixed

- Subagent status events are now batched before TUI flush, eliminating panel flicker during concurrent subagent execution

### Changed

- SubagentsPanel status display improved: clearer labels and Portuguese localization aligned to TUI conventions

## [1.2.42] — 2026-05-27

### Changed

- Internal release housekeeping; no product-facing changes

## [1.2.41] — 2026-05-27

### Added

- `deepcode uninstall` command — removes the global npm installation and local config directory with confirmation prompts

### Changed

- `ProjectDiscovery` extracted from the agent runtime into its own module (`packages/core`), reducing god-class surface

### Security

- Session storage hardened: sessions are written atomically and permissions are constrained to owner-only; MCP subprocess isolation improved; subagent spawn depth is now enforced to prevent unbounded recursion; async I/O paths reviewed for race conditions

## [1.2.40] — 2026-05-24

### Fixed

- `fetch_web`: `web.allowlist` / `web.blacklist` now use exact anchored matching with `*` wildcards by default, preventing substring-based URL policy bypasses; explicit regex requires the `regex:` prefix
- Abort handling: pressing `Esc` / `Ctrl+C` during approval prompts now aborts the full agent run, and aborted tool execution propagates `AbortError` cleanly instead of continuing the loop
- Subagent fork context now carries a compact reasoning thread instead of replaying parent tool-call noise, reducing overflow risk and preserving alternating conversation shape

### Changed

- Runtime contract aligned on Node.js 22+ across workspace metadata, local version files, and CI-facing documentation
- Packaging hygiene: local `npm pack` artifacts are ignored by git, keeping the repository clean after release smoke tests

## [1.2.39] — 2026-05-23

### Fixed

- `read_file` fallback instructions are now skipped when the tool is not in the allowed set for the current run

## [1.2.38] — 2026-05-23

### Added

- Truncated tool output is now persisted to a recovery file so the model can request the full content when needed

## [1.2.37] — 2026-05-23

### Fixed

- Subagent fork context is filtered down to a compact reasoning thread to prevent context overflow

## [1.2.36] — 2026-05-23

### Fixed

- Provider failures in subagents now surface the full error chain instead of a flattened message

## [1.2.35] — 2026-05-23

### Security

- Hardened dependencies, shell command classification, and CI supply-chain pinning

### Fixed

- TUI render churn was reduced around elapsed time and streaming history updates
- Approval Enter-arm state now resets cleanly per prompt and queued output is cleared on abort

## [1.2.34] — 2026-05-23

### Fixed

- Eliminated `ApprovalPrompt` flicker caused by cascading TUI renders

## [1.2.33] — 2026-05-23

### Fixed

- Qwen3, Kimi K2, and MiniMax now use native `tool_calls`; Kimi completion token handling was also corrected

## [1.2.32] — 2026-05-23

### Fixed

- DeepSeek provider updated for the v4 API, including v4-pro thinking mode and native tool-call handling

## [1.2.31] — 2026-05-23

### Fixed

- Added provider model-family profiles for Llama, Mistral, Phi, Yi, and Gemma, plus a safer Ollama default

## [1.2.30] — 2026-05-23

### Fixed

- Minimal tool-schema mode now preserves parameter descriptions required by reasoner-oriented models

## [1.2.29] — 2026-05-23

### Fixed

- XML fallback mode now supports multiple tool calls in a single turn

## [1.2.28] — 2026-05-23

### Added

- `/vim` command support, a dedicated `ApprovalPrompt` component, and expanded TUI approval coverage

## [1.2.27] — 2026-05-22

### Added

- Session-name and picker UX improvements, Vim toggle support, and release rebuild cleanup

## [1.2.24] — 2026-05-22

### Added

- Header update notifications in the TUI and refreshed distribution artifacts for e2e coverage

## [1.2.23] — 2026-05-22

### Added

- `/rename` updates the visible session label, queue indicators were added, and dialogs were aligned to PT-BR

## [1.2.22] — 2026-05-22

### Added

- Scroll indicator, before/after diff view, and richer `doctor` recommendations

## [1.2.21] — 2026-05-22

### Added

- Completed TUI command and utility coverage expansion (146 tests total at that release point)

## [1.2.20] — 2026-05-22

### Added

- Component rendering tests with `ink-testing-library`

## [1.2.19] — 2026-05-22

### Added

- TUI hook and command tests, raising automated coverage substantially

### Changed

- PT-BR consistency, `ThinkMessage` visuals, and `useStatusLine` cleanup
- `/new` session flow, footer cleanup, and current-session labeling improvements

## [1.2.18] — 2026-05-22

### Added

- `/help` keyboard shortcuts, richer `ModelDialog` details, and bordered approval previews

## [1.2.17] — 2026-05-21

### Fixed

- Removed an invalid `react-hooks/exhaustive-deps` eslint suppression comment

## [1.2.16] — 2026-05-21

### Added

- `/yolo` and `/safe` commands, live approval-mode indicator, colored permissions dialog, token accumulation, `/memory`, and early changelog backfill work

## [1.2.15] — 2026-05-21

### Added
- **Live session name**: o nome auto-gerado pelo modelo após o primeiro turno aparece em tempo real no canto superior direito do prompt; persiste ao resumir sessões e atualiza ao trocar de sessão via `/sessions`
- **`/help` com descrições**: o diálogo de ajuda exibe `/comando  —  descrição` alinhados por colunas em vez de só listar nomes
- **`/history`**: mostra contagem total de mensagens da sessão e últimos N prompts do usuário; aceita argumento numérico (`/history 10`)
- **GoalStatusMessage**: renderização visual do ciclo de vida de um goal (`set/checking/achieved/failed/aborted/cleared`) com ícones e duração; `GoalStatusKind` adicionado ao sistema de tipos
- **Elapsed time no AppHeader**: exibe "running 12s" durante execução do agente, incrementando por segundo
- **Timestamps relativos no SessionsDialog**: "há 2 min", "ontem", "há 3 dias" em vez da data locale completa
- **`useGitBranchName`**: hook que detecta branch git via `execFile` e assina `.git/logs/HEAD` para atualização automática em checkout; integrado no AppHeader row 2
- **`BtwMessage`**: renderização de mensagens `/btw` em box amarelo com resposta em Markdown
- **`StatsDisplay` + `/stats`**: painel de estatísticas da sessão (tempo, mensagens, tokens do último turno)

## [1.2.14] — 2026-05-21

### Added
- **`useLoadingIndicator`**: hook de loading com frases PT-BR cíclicas a cada 15s ("Processando...", "Analisando o código...", etc.); retém tempo decorrido durante `WaitingForConfirmation`
- **`StickyTodoList`**: painel "Tarefas em andamento" acima do Composer, atualizado em tempo real a partir de resultados de ferramentas `todo_list`; ordena `in_progress → pending → completed`
- **`DoctorReport` + `/doctor`**: diagnóstico visual de ambiente e configuração por categoria (pass/warn/fail); verifica Node.js ≥ 22, CWD, git, .deepcode, provider, modelo, API key e MCP

## [1.2.13] — 2026-05-21

### Added
- **ShowMoreLines**: limita altura de mensagens longas; ctrl-s expande, qualquer tecla recolhe
- **useStatusLine**: refresh da branch git a cada 30 s (antes disparo único no mount)
- **/export `<markdown|json>`**: exporta o histórico da sessão para arquivo
- **CompressionMessage**: renderização visual dedicada ao resultado do `/compact` com spinner e stats de tokens
- **SummaryMessage**: renderização de resumo de contexto com indicador de fase (generating/saving)
- **Notifications**: banner não-bloqueante acima do Composer para avisos de startup
- **AppHeader**: componente de header próprio com versão, provider/modelo, modo, status e diretório de trabalho
- **/context** (e `/context detail`): exibe uso estimado da janela de contexto com progress bar e breakdown por categoria

## [1.2.12] — 2026-05-21

### Fixed

- Prevented session corruption when the repeated-error abort fires mid-iteration: tool calls that were registered in the assistant message but not yet executed now receive a synthetic cancelled result, avoiding orphaned `tool_use` entries that would cause API rejection on session resume.

## [1.1.28] — 2026-05-19

### Fixed

- Re-scoped file and shell tool permissions to the selected project worktree, so switching projects no longer leaves the approval policy bound to the initial runtime directory.
- Added a short Enter debounce to the TUI approval prompt to prevent accidental approvals from the prompt-submit keypress.
- Improved missing-model errors to name the affected provider and the exact `defaultModels.<provider>` setting to configure.

### Changed

- Production runtime support now targets Node.js `>=20.20.0`; CI validates Node 20.20.0 and 22, and the published bundle targets Node 20.

## [1.1.13] — 2026-05-17

### Fixed

- `deepcode github solve` agent prompt translated to English; previously hardcoded in Portuguese, causing the agent to receive PT-BR instructions when working on any repository

## [1.1.12] — 2026-05-17

### Added

- `.editorconfig` at the repository root — enforces 2-space indent, LF line endings, UTF-8, trim trailing whitespace, and final newline for all files; Markdown files keep `trim_trailing_whitespace = false`

## [1.1.11] — 2026-05-17

### Fixed

- `deepcode github solve` no longer throws "Agent completed without file changes" when the agent commits files itself (via the `git`/`bash` tool); now checks both the working tree and commits ahead of the base branch before deciding whether to add/commit

## [1.1.10] — 2026-05-17

### Fixed

- `deepcode run` now prints runtime warnings and errors to stderr; previously `app:warn` / `app:error` events (MCP failures, budget exceeded, provider errors) were silently dropped in non-interactive mode

## [1.1.9] — 2026-05-17

### Fixed

- `deepcode doctor` no longer exits 1 when language servers for unused languages are absent; `lsp.servers` default is now an empty list — configure only the servers you have installed

## [1.1.8] — 2026-05-17

### Added

- **MCPHealthPill** — footer now shows `MCP n/m` when MCP servers are configured; green when all connected, amber when some failed to connect
- **useStatusLine** — footer shows current working directory and git branch (`~/path [branch]`) when inside a git repository; falls back to the standard hint when not in git

## [1.1.7] — 2026-05-17

### Fixed

- TUI: header no longer shows stale provider/mode when the target changes mid-session

## [1.1.6] — 2026-05-17

### Fixed

- Project discovery tests aligned with home-directory scan behaviour (internal)

## [1.1.5] — 2026-05-17

### Added

- **`deepcode projects`** — interactive project browser TUI; lists git repos discovered under the home directory with fuzzy search, opens a chat session in the selected worktree on Enter

## [1.1.4] — 2026-05-17

### Added

- **Groq provider** — CRLF SSE stream parsing; Qwen3 reasoning (`<think>`) stripped from output; Groq models now appear in the model picker
- **Agent situational awareness** — greetings and small-talk are handled locally without calling the LLM

### Fixed

- Approval prompt UX: Enter now approves, key hints are clearer
- Tool parameter schemas downgraded to JSON Schema draft-7 for provider compatibility
- `defaultProvider` schema no longer injects a hardcoded default into written config files
- Provider failover now uses each provider's own configured model and skips providers with no credentials

### Changed

- Project discovery constrained to directories that are git repositories
- CI: secret scan now covers all tracked files, not just staged changes

## [1.1.3] — 2026-05-17

### Fixed

- Model picker: latency badge updates correctly after applying a provider
- Model picker dialog excluded from the static `CommandDialog` fallback path
- Model name and provider group separated correctly in the footer display

## [1.1.2] — 2026-05-17

### Added

- **Model picker dialog** — `/model` opens an interactive picker with search, a Recent section, and models grouped by provider
- **Provider dialog redesign** — submenu layout, key hints, and a live latency badge (`Ctrl+P`)
- TUI: slash command auto-submits on Enter immediately after selecting from the suggestion list

## [1.1.0] — 2026-05-16

### Changed

- **Full TUI replacement** — shell rewritten on Qwen Code's Ink 7 / React 19 architecture; brings richer key-binding support, a composable component model, and a substantially reduced re-render surface during streaming

## [1.0.0] — 2026-05-14

### Added

- **MCP support** — Model Context Protocol client over stdio (JSON-RPC 2.0); connect any MCP server via `mcpServers` config; tools appear automatically prefixed as `server__tool`
- **Context window management** — auto-summarizes conversation history when approaching the model's context limit (`contextWindowThreshold`); summary injected as a `context_summary` message so the model retains full intent
- **Token budget enforcement** — configurable `maxInputTokens`, `maxOutputTokens`, `maxCostUsd`; emits `budget:warning` at configurable fraction and `budget:exceeded` hard stop via EventBus
- **`deepcode github review <PR>`** — AI code review command: fetches PR metadata and diff in parallel, runs agent with structured analysis prompt; supports `--focus <area>` flag (repeatable)
- **`deepcode github prs`** — list open pull requests in the current repo
- **`deepcode github merge <PR>`** — merge a pull request

### Changed

- All internal `console.warn` / `console.error` calls routed through `EventBus` (`app:warn`, `app:error`) so warnings surface correctly in TUI and non-interactive modes
- Groq and Ollama added to agent failover chain

### Fixed

- Groq and Ollama excluded from failover order despite being registered providers
- `search_symbols` heuristic fallback when no LSP server is configured

## [0.3.0] — 2026-05-13

### Added

- Groq provider (`groq`) — fast inference for Llama and Mixtral models
- Ollama provider (`ollama`) — local model execution, no API key required
- 429 / 503 retry logic with `retryAfterMs` backoff and configurable `providerRetries`
- Credential-free provider support (Ollama runs without an API key)
- Vim normal mode with block cursor in the TUI input
- E2E test for GitHub issue-solve flow using a local git-http-backend server

### Changed

- `ProviderManager` failover now skips providers that already emitted streamed output
- 401 authentication errors skip retry entirely

## [0.2.0] — 2026-05-10

### Added

- Initial public release surface: README, CONTRIBUTING, SECURITY, CHANGELOG, LICENSE
- Publishable `deepcode-ai` npm package bundling all workspace packages
- CI workflow: lint + typecheck + test + build on push and pull requests
- Release workflow: npm publish + GitHub Release on `v*.*.*` tag push

## [0.1.3] — 2026-05-09

### Fixed

- bin path prefix validation for npm (`./` removed from bin entries)

## [0.1.2] — 2026-05-09

### Fixed

- Packaging fixes for workspace dependency bundling

## [0.1.1] — 2026-05-09

### Added

- TUI detail panel: `ToolInspector` and `DiffDetailPanel` components

## [0.1.0] — 2026-05-06

### Added

- Initial repository with multi-package monorepo structure (`apps/`, `packages/`)
- Agent runtime with PLAN and BUILD modes, task planner, subagent orchestration
- Provider abstraction: Anthropic, OpenAI, DeepSeek, OpenRouter, OpenCode
- Tool system: filesystem, shell, git, ripgrep, lint, test, LSP symbol search
- Permission model: path policy, approval gateway, audit logging, secret redaction
- Ink TUI with streaming output, diff previews, and approval flows
- Persistent sessions, local config, telemetry collector
- GitHub integration: OAuth, issues, pull requests

[Unreleased]: https://github.com/N1ghthill/deepcode/compare/v1.2.48...HEAD
[1.2.48]: https://github.com/N1ghthill/deepcode/compare/v1.2.47...v1.2.48
[1.2.47]: https://github.com/N1ghthill/deepcode/compare/v1.2.46...v1.2.47
[1.2.46]: https://github.com/N1ghthill/deepcode/compare/v1.2.45...v1.2.46
[1.2.45]: https://github.com/N1ghthill/deepcode/compare/v1.2.44...v1.2.45
[1.2.44]: https://github.com/N1ghthill/deepcode/compare/v1.2.43...v1.2.44
[1.2.43]: https://github.com/N1ghthill/deepcode/compare/v1.2.42...v1.2.43
[1.2.42]: https://github.com/N1ghthill/deepcode/compare/v1.2.41...v1.2.42
[1.2.41]: https://github.com/N1ghthill/deepcode/compare/v1.2.40...v1.2.41
[1.2.40]: https://github.com/N1ghthill/deepcode/compare/v1.2.39...v1.2.40
[1.2.39]: https://github.com/N1ghthill/deepcode/compare/v1.2.38...v1.2.39
[1.2.38]: https://github.com/N1ghthill/deepcode/compare/v1.2.37...v1.2.38
[1.2.37]: https://github.com/N1ghthill/deepcode/compare/v1.2.36...v1.2.37
[1.2.36]: https://github.com/N1ghthill/deepcode/compare/v1.2.35...v1.2.36
[1.2.35]: https://github.com/N1ghthill/deepcode/compare/v1.2.34...v1.2.35
[1.2.34]: https://github.com/N1ghthill/deepcode/compare/v1.2.33...v1.2.34
[1.2.33]: https://github.com/N1ghthill/deepcode/compare/v1.2.32...v1.2.33
[1.2.32]: https://github.com/N1ghthill/deepcode/compare/v1.2.31...v1.2.32
[1.2.31]: https://github.com/N1ghthill/deepcode/compare/v1.2.30...v1.2.31
[1.2.30]: https://github.com/N1ghthill/deepcode/compare/v1.2.29...v1.2.30
[1.2.29]: https://github.com/N1ghthill/deepcode/compare/v1.2.28...v1.2.29
[1.2.28]: https://github.com/N1ghthill/deepcode/compare/v1.2.27...v1.2.28
[1.2.27]: https://github.com/N1ghthill/deepcode/compare/v1.2.24...v1.2.27
[1.2.24]: https://github.com/N1ghthill/deepcode/compare/v1.2.23...v1.2.24
[1.2.23]: https://github.com/N1ghthill/deepcode/compare/v1.2.22...v1.2.23
[1.2.22]: https://github.com/N1ghthill/deepcode/compare/v1.2.21...v1.2.22
[1.2.21]: https://github.com/N1ghthill/deepcode/compare/v1.2.20...v1.2.21
[1.2.20]: https://github.com/N1ghthill/deepcode/compare/v1.2.19...v1.2.20
[1.2.19]: https://github.com/N1ghthill/deepcode/compare/v1.2.18...v1.2.19
[1.2.18]: https://github.com/N1ghthill/deepcode/compare/v1.2.17...v1.2.18
[1.2.17]: https://github.com/N1ghthill/deepcode/compare/v1.2.16...v1.2.17
[1.2.16]: https://github.com/N1ghthill/deepcode/compare/v1.2.15...v1.2.16
[1.2.15]: https://github.com/N1ghthill/deepcode/compare/v1.2.14...v1.2.15
[1.2.14]: https://github.com/N1ghthill/deepcode/compare/v1.2.13...v1.2.14
[1.2.13]: https://github.com/N1ghthill/deepcode/compare/v1.2.12...v1.2.13
[1.2.12]: https://github.com/N1ghthill/deepcode/compare/v1.2.11...v1.2.12
[1.1.28]: https://github.com/N1ghthill/deepcode/compare/v1.1.13...v1.1.28
[1.1.13]: https://github.com/N1ghthill/deepcode/compare/v1.1.12...v1.1.13
[1.1.12]: https://github.com/N1ghthill/deepcode/compare/v1.1.11...v1.1.12
[1.1.11]: https://github.com/N1ghthill/deepcode/compare/v1.1.10...v1.1.11
[1.1.10]: https://github.com/N1ghthill/deepcode/compare/v1.1.9...v1.1.10
[1.1.9]: https://github.com/N1ghthill/deepcode/compare/v1.1.8...v1.1.9
[1.1.8]: https://github.com/N1ghthill/deepcode/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/N1ghthill/deepcode/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/N1ghthill/deepcode/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/N1ghthill/deepcode/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/N1ghthill/deepcode/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/N1ghthill/deepcode/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/N1ghthill/deepcode/compare/v1.1.0...v1.1.2
[1.1.0]: https://github.com/N1ghthill/deepcode/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/N1ghthill/deepcode/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/N1ghthill/deepcode/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/N1ghthill/deepcode/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/N1ghthill/deepcode/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/N1ghthill/deepcode/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/N1ghthill/deepcode/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/N1ghthill/deepcode/releases/tag/v0.1.0
