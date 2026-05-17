# Changelog

All notable product-facing changes to this repository are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/N1ghthill/deepcode/compare/v1.1.7...HEAD
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
