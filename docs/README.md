# Terminuz Documentation

This directory contains the product and engineering reference for Terminuz.

The repository README is the public entrypoint. This directory is the detailed reference layer behind it. Some engineering notes are still maintained in Portuguese because that is the working language of the repository today.

## Recommended Reading Order

### Product and Architecture

- [01 - Vision and Requirements](./01-vision-and-requirements.md)
- [02 - Architecture Overview](./02-architecture-overview.md)
- [05 - TUI Design](./05-tui-design.md)
- [06 - Security Model](./06-security-model.md)
- [08 - Tool System](./08-tool-system.md)
- [16 - Configuration](./16-configuration.md)
- [19 - Migrating from DeepCode to Terminuz](./19-migrating-from-deepcode.md)

### Runtime and Implementation Reference

- [07 - Provider Abstraction](./07-provider-abstraction.md)
- [09 - Agent Loop](./09-agent-loop.md)
- [10 - GitHub Integration](./10-github-integration.md)
- [11 - Search Strategy](./11-search-strategy.md)
- [12 - State Management](./12-state-management.md)
- [13 - Testing Strategy](./13-testing-strategy.md)
- [18 - Terminuz Rebranding Roadmap](./18-terminuz-rebranding-roadmap.md)

### Planning and Development History

- [03 - Technology Stack](./03-technology-stack.md)
- [04 - Implementation Phases](./04-implementation-phases.md)
- [14 - Decisions Log](./14-decisions-log.md)
- [15 - Handoff and Next Steps](./15-handoff-next-steps.md)
- [17 - Agent UX Maturity Plan](./17-agent-ux-maturity-plan.md)

## Reference (live)

Auto-generated or living references about the running agent:

- [Agent Context](./reference/AGENT_CONTEXT.md) — runtime, providers, tools, prompts, TUI
- [Approval System](./reference/APPROVAL_SYSTEM.md) — permission gateway and approval flow
- [Brand Assets](./assets/README.md) — public logos, icon, and demo media

## Archive

Historical plans and refactor notes (kept for context):

- [TUI Refactor Plan](./archive/TUI_REFACTOR_PLAN.md)
- [TUI Qwen Migration](./archive/tui-qwen-migration.md) — working notes from the Ink 4→7 / Qwen Code port
- [TUI Qwen Sync](./archive/tui-qwen-sync.md) — historical diff analysis between the previous DeepCode TUI and Qwen Code

## Repository Policies

- [../CONTRIBUTING.md](../CONTRIBUTING.md)
- [../SECURITY.md](../SECURITY.md)
- [../CHANGELOG.md](../CHANGELOG.md)
