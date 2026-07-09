# 21 - Production Readiness Evidence

This file records verifiable production evidence for the Terminuz rebrand. It is
not a replacement for legal, trademark, domain, or account-recovery records that
must live outside the public repository.

## Verified on 2026-07-09

- npm account used for checks: `n1ghthill`.
- `terminuz@2.0.0` is published on npm.
- `terminuz` dist-tags:
  - `latest: 2.0.0`
  - `stable: 2.0.0`
  - `beta: 2.0.0-beta.0`
- `deepcode-ai@1.3.0` is published as the compatibility wrapper.
- `deepcode-ai` dist-tags:
  - `latest: 1.3.0`
  - `stable: 1.2.83`
- GitHub repository remote: `https://github.com/N1ghthill/terminuz.git`.
- Legacy GitHub repository URL redirects:
  - `https://github.com/N1ghthill/deepcode` -> `https://github.com/N1ghthill/terminuz`
  - `https://github.com/N1ghthill/deepcode/actions/workflows/ci.yml` -> `https://github.com/N1ghthill/terminuz/actions/workflows/ci.yml`
- GitHub Release:
  - tag: `terminuz-v2.0.0`
  - URL: `https://github.com/N1ghthill/terminuz/releases/tag/terminuz-v2.0.0`
  - release workflow: `https://github.com/N1ghthill/terminuz/actions/runs/29039959559`
  - result: success; npm publish was skipped because `terminuz@2.0.0` already existed.

## Local Gates

- `pnpm validate` passed.
- Markdown local link check passed, excluding generated/local directories.
- `npm pack --dry-run --json` passed for `apps/terminuz`.
- `npm pack --dry-run --json` passed for `apps/deepcode-legacy`.

## Installation Matrix

All installation checks used temporary global prefixes and did not mutate the
machine global install.

- npm clean install: `npm install -g --prefix <tmp> terminuz@latest`
  - `terminuz --version` returned `2.0.0`.
- npm stable install: `npm install -g --prefix <tmp> --tag stable terminuz`
  - `terminuz --version` returned `2.0.0`.
- pnpm clean install: `PNPM_HOME=<tmp> pnpm add -g terminuz@latest`
  - `terminuz --version` returned `2.0.0`.
- pnpm stable install: `PNPM_HOME=<tmp> pnpm add -g terminuz@stable`
  - `terminuz --version` returned `2.0.0`.
- legacy wrapper install: `npm install -g --prefix <tmp> deepcode-ai@latest`
  - `deepcode --version` returned `2.0.0` after printing the migration notice.
  - `deepcode-ai --version` returned `2.0.0` after printing the migration notice.
- rollback install:
  - installed `terminuz@latest`;
  - uninstalled `terminuz`;
  - installed `deepcode-ai@1.2.83`;
  - `deepcode --version` returned `1.2.83`.

## Project Data Matrix

All project-data checks used `terminuz@stable` from a temporary global prefix.

- Project with only `.deepcode/config.json`: effective config loaded the legacy
  value and printed the migration notice.
- Project with only `.terminuz/config.json`: effective config loaded the
  preferred value.
- Project with both `.terminuz/config.json` and `.deepcode/config.json`:
  effective config used `.terminuz/config.json`.

## Remaining External Evidence

The following items cannot be truthfully completed from this workspace alone:

- archive trademark/legal search evidence and professional guidance;
- archive domain ownership, DNS, and redirect evidence;
- archive social/community handle ownership evidence;
- archive account recovery/2FA ownership records for npm, GitHub, and domain
  registrar accounts;
- confirm final deprecation action for `deepcode-ai` after 2027-01-08.
