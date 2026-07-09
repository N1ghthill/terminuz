# Terminuz

> **Terminuz - The Open Source AI Coding Agent**

Terminuz is a local, permission-aware, multi-provider coding agent for the
terminal.

## Install

```bash
npm install -g terminuz
terminuz --version
terminuz init
terminuz
```

## Common commands

```bash
terminuz run "fix the failing tests" --yes
terminuz review
terminuz doctor
terminuz config show --effective
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

Terminuz does not automatically delete or overwrite `.deepcode/`.

## Links

- Repository: <https://github.com/N1ghthill/terminuz>
- Configuration: <https://github.com/N1ghthill/terminuz/blob/main/docs/16-configuration.md>
- Security: <https://github.com/N1ghthill/terminuz/blob/main/docs/06-security-model.md>
- Migration roadmap: <https://github.com/N1ghthill/terminuz/blob/main/docs/18-terminuz-rebranding-roadmap.md>

Terminuz is released under the MIT License.
