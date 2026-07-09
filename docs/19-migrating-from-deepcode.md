# Migrating from DeepCode to Terminuz

Terminuz is the new name of the project previously distributed as `deepcode-ai`.
The product name is **Terminuz** and the primary command is `terminuz`.

The rename gives the project a distinct product identity while keeping its
purpose unchanged: an open-source AI coding agent designed for terminal-based
development.

## Install

```bash
npm uninstall -g deepcode-ai
npm install -g terminuz
terminuz --version
```

During the compatibility window, the `deepcode-ai` package remains available as
a wrapper. Its `deepcode` and `deepcode-ai` commands invoke Terminuz and print a
migration notice.

## Configuration and data

Terminuz writes new project state to `.terminuz/`. Existing state is not moved or
deleted automatically.

Resolution order:

1. an explicit CLI path or flag;
2. `TERMINUZ_*` environment variables;
3. legacy `DEEPCODE_*` environment variables;
4. `.terminuz/config.json`;
5. legacy `.deepcode/config.json`;
6. defaults.

Custom agents and sessions stored under `.deepcode/` remain readable. When both
directories contain the same logical item, the `.terminuz/` version wins.

## Verify a migrated project

```bash
terminuz doctor
terminuz config --effective
terminuz sessions
```

Keep `.deepcode/` until the project and its sessions have been verified. Terminuz
does not delete it during uninstall.

## Rollback

If a beta blocks your workflow:

```bash
npm uninstall -g terminuz
npm install -g deepcode-ai@1.2.83
deepcode --version
```

Do not delete `.terminuz/` or `.deepcode/` while diagnosing a rollback. Report
the Terminuz version, operating system, Node.js version, and the output of
`terminuz doctor`, after removing any secrets.

## Compatibility removal

No removal date has been announced for `.deepcode/`, `DEEPCODE_*`, or the
`deepcode-ai` wrapper. A minimum support window and removal release must be
published before any of these fallbacks are removed.
