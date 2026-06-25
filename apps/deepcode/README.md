# deepcode

<p align="center">
  <img src="https://raw.githubusercontent.com/N1ghthill/deepcode/main/docs/assets/logo_deepcode_on_white.png" alt="DeepCode logo" width="520">
</p>

<p align="center">
  <a href="https://github.com/N1ghthill/deepcode/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/N1ghthill/deepcode/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/deepcode-ai"><img alt="npm version" src="https://img.shields.io/npm/v/deepcode-ai?color=7c3aed"></a>
  <a href="https://www.npmjs.com/package/deepcode-ai"><img alt="npm downloads" src="https://img.shields.io/npm/dm/deepcode-ai"></a>
  <img alt="Node.js 22+" src="https://img.shields.io/badge/node-22%2B-3c873a">
  <a href="https://github.com/N1ghthill/deepcode/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

DeepCode is a terminal-first AI coding agent for local software development. It understands your repository, runs tools with a permission model, and works with Anthropic, OpenAI, DeepSeek, Groq, Ollama, OpenRouter, and MCP servers.

## Install

Requires Node.js 22 or newer.

```bash
npm install -g deepcode-ai
```

```bash
deepcode --version
deepcode init
deepcode doctor
deepcode
```

## Common Commands

```bash
deepcode run "fix the failing tests" --yes
deepcode review
deepcode config show --effective
deepcode github login
deepcode update
```

## Links

- Repository: <https://github.com/N1ghthill/deepcode>
- Product documentation: <https://github.com/N1ghthill/deepcode#readme>
- Configuration reference: <https://github.com/N1ghthill/deepcode/blob/main/docs/16-configuration.md>
- Security model: <https://github.com/N1ghthill/deepcode/blob/main/docs/06-security-model.md>
