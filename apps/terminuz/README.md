# Terminuz

> **Terminuz - The Open Source AI Coding Agent**

Terminuz is a local, permission-aware, multi-provider coding agent for the
terminal.

## Built with OpenAI Codex

Terminuz was built primarily with OpenAI Codex. Local evidence preserves 51
development sessions beginning with the repository's creation, and 406 of its
425 commits (95.5%) retain the Codex-configured `DeepCode` author identity.

For the OpenAI Build Week, GPT-5.6 was used to implement health-aware provider
routing with configuration-aware failover, transient-failure cooldowns,
automatic recovery, and sanitized `provider.route` observability. Read the
[evidence and demo kit](https://github.com/N1ghthill/terminuz/blob/main/docs/22-openai-build-week-submission.md).

## Install

```bash
npm install -g terminuz
terminuz --version
terminuz init
terminuz
```

Stable channel:

```bash
npm install -g --tag stable terminuz
```

## Common commands

```bash
terminuz run "fix the failing tests" --yes
terminuz review
terminuz doctor
terminuz config show --effective
terminuz config credentials-path
terminuz cache tmp clear
terminuz github login
terminuz update
```

## Migrating from DeepCode

Terminuz reads legacy `.deepcode/` configuration and sessions when no preferred
Terminuz state exists. `DEEPCODE_*` environment variables remain compatibility
aliases below `TERMINUZ_*` in precedence.

```bash
npm uninstall -g deepcode-ai
npm install -g terminuz
```

Terminuz does not automatically delete `.deepcode/`. Plaintext provider keys
and GitHub tokens are the exception: they are migrated from legacy project
configuration to the private user credential store and removed from the legacy
file after the protected copy succeeds.
The `deepcode-ai` compatibility wrapper remains supported through 2027-01-08.

## Credential security

API keys entered through the TUI or `terminuz config set` are stored outside the
project in a project-scoped entry. On Linux the default file is
`~/.config/terminuz/credentials.json`, with directory mode `0700` and file mode
`0600`. Use `terminuz config credentials-path` to print the platform-specific
location. Environment variables are never persisted by Terminuz.
Secret-bearing variables are not forwarded to child processes started by agent
tools.

## Links

- Repository: <https://github.com/N1ghthill/terminuz>
- Configuration: <https://github.com/N1ghthill/terminuz/blob/main/docs/16-configuration.md>
- Security: <https://github.com/N1ghthill/terminuz/blob/main/docs/06-security-model.md>
- Migration roadmap: <https://github.com/N1ghthill/terminuz/blob/main/docs/18-terminuz-rebranding-roadmap.md>
- Production evidence: <https://github.com/N1ghthill/terminuz/blob/main/docs/21-production-readiness-evidence.md>

Terminuz is released under the MIT License.
