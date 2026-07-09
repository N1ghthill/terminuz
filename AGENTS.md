# Agent Operating Guide

This repository is a product repository. Treat every change as something that may be released to npm.

## Runtime

- Use Node.js 22 or newer. The local target is Node `22.x`.
- Use pnpm through Corepack. The repository declares `pnpm@9.15.0` in `package.json`.
- Do not introduce npm, yarn, or bun lockfiles.

Useful setup checks:

```bash
node --version
corepack pnpm --version
pnpm install
```

## Change Workflow

`main` is protected. Do not work directly on `main` for repository changes.

1. Create a branch:
   ```bash
   git switch -c <type>/<short-topic>
   ```
2. Keep changes scoped to one concern.
3. Run focused checks while developing.
4. Run the full gate before opening a PR:
   ```bash
   pnpm validate
   ```
5. Push the branch and open a PR.

The required remote check is `validate (22)`. It must pass before merge.

## Validation

Use `pnpm validate` as the single full local gate. It runs:

```bash
pnpm secrets:scan
pnpm audit
pnpm audit --prod
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For narrow iteration, use package filters first, then finish with `pnpm validate`:

```bash
pnpm --filter @terminuz/core test
pnpm --filter @terminuz/cli test
pnpm --filter terminuz build
```

## Repository Boundaries

- `apps/terminuz` is the publishable Terminuz npm package (`terminuz`).
- `apps/deepcode-legacy` is the temporary `deepcode-ai` compatibility package.
- `packages/cli` owns commands and the Ink TUI.
- `packages/core` owns runtime, providers, tools, GitHub integration, security, and workflows.
- `packages/shared` owns shared schemas and contracts.
- `docs` owns product and engineering reference material.

Keep feature logic in the package that owns the behavior. Avoid adding runtime logic to `apps/terminuz` unless it is package entrypoint or packaging glue.

## Security Rules

- Never commit real API keys, npm tokens, GitHub tokens, `.env` files, or local `.terminuz`/`.deepcode` state.
- Keep secret-bearing output out of docs, tests, snapshots, and logs.
- If package contents change, verify with:
  ```bash
  npm pack --dry-run --json
  ```
- Dependency changes must leave both `pnpm audit` and `pnpm audit --prod` clean.

## Release Process

Releases should go through CI, not manual local publish.

1. Start from a clean, up-to-date `main`.
2. Run:
   ```bash
   pnpm release:patch
   ```
   Use `release:minor` or `release:major` only when the version semantics require it.
3. The release script validates, bumps the selected public package, commits, tags, and pushes.
4. The GitHub Release workflow publishes `terminuz` or the `deepcode-ai` compatibility package with provenance.
5. If the version already exists on npm, the workflow skips publishing and still creates the GitHub release.

After the release is verified, promote the same version to `stable`:

```bash
pnpm promote-stable
```

Check tags:

```bash
npm dist-tag ls terminuz
```

## Branch Protection

`main` requires:

- pull request workflow
- `validate (22)` status check
- up-to-date branch before merge
- no force pushes
- no branch deletion

Admins are included in enforcement. Expect direct pushes to `main` to be rejected.
