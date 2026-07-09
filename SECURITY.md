# Security Policy

Terminuz is a local coding agent that can read files, edit code, execute commands, and interact with GitHub. Security is part of the product surface, not a secondary concern.

## Reporting a Vulnerability

If you discover a vulnerability, do not open a public issue with exploit details.

Instead:

1. Prepare a minimal description of the issue, impact, affected files, and reproduction steps.
2. Contact the maintainer privately through the security contact channel you have available for this repository.
3. Include whether credentials, filesystem boundaries, approval flow, GitHub auth, or data redaction are affected.

If no private channel is available, open a minimal public issue without sensitive details and request a secure follow-up channel.

## High-Risk Areas

Pay extra attention to:

- permission gating
- path allowlist and blacklist enforcement
- shell command execution
- secret redaction
- GitHub authentication and device flow
- configuration loading from files and environment variables
- telemetry persistence and export

## Secret Handling Rules

- never commit `.terminuz/config.json` or legacy `.deepcode/config.json` with live credentials
- never commit nested `.terminuz` or `.deepcode` directories with local state
- never paste real tokens into tests or docs
- prefer redacted fixtures and synthetic values in automated coverage

## Security Documentation

The detailed runtime security model lives in [docs/06-security-model.md](docs/06-security-model.md).
