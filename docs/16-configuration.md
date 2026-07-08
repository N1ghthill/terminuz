# 16 - Configuracao

## Visao Geral

DeepCode carrega configuracao de `.deepcode/config.json` e aplica overrides de ambiente em runtime. O comando `deepcode config` edita apenas o arquivo local; valores vindos de ambiente podem ser inspecionados com `--effective`, mas nao sao gravados no disco.

Secrets sao mascarados em `config show`, `config get`, erros da CLI, output do agente, telemetry export e logs de auditoria.

## Ordem de Precedencia

1. Defaults do schema compartilhado.
2. `.deepcode/config.json` ou o arquivo passado por `--config`.
3. Variaveis de ambiente aplicadas no runtime:
   - `DEEPCODE_PROVIDER`
   - `DEEPCODE_MODEL`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_API_KEY_FILE`
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_API_KEY_FILE`
   - `OPENAI_API_KEY`
   - `OPENAI_API_KEY_FILE`
   - `DEEPSEEK_API_KEY`
   - `DEEPSEEK_API_KEY_FILE`
   - `OPENCODE_API_KEY`
   - `OPENCODE_API_KEY_FILE`
   - `GITHUB_TOKEN`
   - `GITHUB_OAUTH_CLIENT_ID`
   - `GITHUB_OAUTH_SCOPES`
   - `CACHE_ENABLED`
   - `CACHE_TTL_SECONDS`
   - `DEEPCODE_THEME`
   - `DEEPCODE_COMPACT`

## Comandos Principais

```bash
deepcode config path
deepcode config show
deepcode config show --effective
deepcode config get defaultProvider
deepcode config get defaultModels.deepseek
deepcode config set defaultProvider deepseek
deepcode config set defaultModels.deepseek "deepseek-v4-flash"
deepcode config set modeDefaults.plan.provider deepseek
deepcode config set modeDefaults.plan.model deepseek-reasoner
deepcode config set modeDefaults.build.provider openrouter
deepcode config set buildTurnPolicy.mode heuristic
deepcode config set providers.deepseek.apiKey "..."
deepcode config set providers.deepseek.apiKeyFile "~/.config/deepseek.key"
deepcode config set github.oauthClientId "..."
deepcode config set github.oauthScopes '["repo"]'
deepcode config set cache.enabled false
deepcode config set cache.ttlSeconds 600
deepcode config set permissions.allowShell '["pnpm test","pnpm build","git status"]'
deepcode config set permissions.mcp ask
deepcode config set mcpPermissions.github__list_issues allow
deepcode config set paths.whitelist '["${WORKTREE}/**","/tmp/**"]'
deepcode config set web.allowlist '["docs.example.com","*.trusted.example.com"]'
deepcode config unset modeDefaults.plan.model
```

Arrays and objects must be valid JSON. Scalar values are parsed from the current schema type; use `--json` when you intentionally want JSON parsing for a scalar.

## Provider e Modelo

O schema atual suporta duas camadas de selecao:

- `defaultProvider`: provider padrao do repositorio.
- `defaultModels.<provider>`: modelo padrao por provider.
- `modeDefaults.plan` e `modeDefaults.build`: overrides de provider/modelo por modo do agente.

`defaultModel` ainda existe por compatibilidade retroativa, mas a configuracao recomendada para produto e:

1. definir `defaultProvider`
2. definir `defaultModels.<provider>`
3. definir `modeDefaults.plan` e `modeDefaults.build` quando quiser comportamento diferente por modo

## Build Turn Policy

`buildTurnPolicy` controla como o modo `BUILD` decide entre responder diretamente e usar ferramentas.

- padrao: `mode: "heuristic"`
- `mode: "heuristic"` usa frases conversacionais, termos de workspace, verbos de tarefa e extensoes de arquivo.
- `mode: "always-tools"` força o fluxo com tools para todo turno em `BUILD`.

As comparacoes sao case-insensitive e accent-insensitive.

## Arquivo Completo de Exemplo

```json
{
  "defaultProvider": "deepseek",
  "defaultModels": {
    "deepseek": "deepseek-v4-flash",
    "openrouter": "qwen/qwen3-coder"
  },
  "modeDefaults": {
    "plan": {
      "provider": "deepseek",
      "model": "deepseek-reasoner"
    },
    "build": {
      "provider": "deepseek",
      "model": "deepseek-v4-flash"
    }
  },
  "maxIterations": 20,
  "providerRetries": 2,
  "temperature": 0.2,
  "maxTokens": 4096,
  "cache": {
    "enabled": true,
    "ttlSeconds": 300
  },
  "providers": {
    "deepseek": {
      "apiKey": "..."
    },
    "openrouter": {
      "apiKeyFile": "~/.config/openrouter.key"
    }
  },
  "permissions": {
    "read": "allow",
    "write": "ask",
    "gitLocal": "allow",
    "shell": "ask",
    "mcp": "ask",
    "dangerous": "ask",
    "allowShell": [
      "git status",
      "git diff",
      "pnpm test",
      "pnpm build"
    ]
  },
  "mcpPermissions": {
    "github__list_issues": "allow"
  },
  "mcpServers": [
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  ],
  "paths": {
    "whitelist": ["${WORKTREE}/**"],
    "blacklist": [
      "**/.env",
      "**/.env.*",
      "**/.ssh/**",
      "**/.aws/**",
      "**/node_modules/**",
      "/etc/**",
      "/usr/bin/**",
      "${HOME}/.config/**"
    ]
  },
  "web": {
    "allowlist": [],
    "blacklist": []
  },
  "lsp": {
    "servers": [
      {
        "languages": ["typescript", "javascript"],
        "command": "typescript-language-server",
        "args": ["--stdio"],
        "fileExtensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
      },
      {
        "languages": ["python"],
        "command": "pylsp",
        "args": [],
        "fileExtensions": [".py"]
      }
    ]
  },
  "github": {
    "token": "...",
    "oauthClientId": "github-oauth-app-client-id",
    "oauthScopes": ["repo"]
  },
  "tui": {
    "theme": "dark",
    "compactMode": false,
    "showInputPreview": true
  },
  "buildTurnPolicy": {
    "mode": "heuristic",
    "conversationalPhrases": ["oi", "ola", "bom dia", "thanks"],
    "workspaceTerms": ["repo", "project", "arquivo", "teste"],
    "taskVerbs": ["read", "inspect", "fix", "refactor", "leia", "corrija"],
    "fileExtensions": [".ts", ".tsx", ".js", ".json", ".md", ".py"]
  },
  "agentMode": "build",
  "strictMode": false,
  "telemetry": {
    "enabled": true,
    "persistHistory": true
  }
}
```

## Politica de Filesystem

- `paths.whitelist`: define onde o agente pode operar.
- `paths.blacklist`: bloqueia caminhos sensiveis mesmo que estejam dentro da allowlist.
- por default, DeepCode opera apenas dentro de `${WORKTREE}/**`
- em modo nao interativo, `--yes` nao aprova automaticamente paths fora da whitelist; use `--yes --allow-outside-worktree` apenas quando confiar explicitamente no caminho.

Exemplos:

```bash
deepcode run "fix local tests" --yes
deepcode run "read /tmp/fixture-output" --yes --allow-outside-worktree
```

## Politica Web

`fetch_web` usa politica separada da politica de filesystem.

- `web.allowlist`: quando vazia, qualquer URL ainda depende de permissao.
- `web.allowlist`: quando preenchida, a URL precisa casar com algum padrao.
- `web.blacklist`: bloqueia URLs mesmo quando a allowlist permitiria.

Os padroes usam matching exato com `*` como wildcard:

- `docs.example.com` -> host exato
- `*.example.com` -> subdominios
- `example.com/docs/*` -> host + path
- `https://docs.example.com/reference/*` -> origin + path
- `/internal/*` -> apenas path

Para casos avancados, use `regex:` de forma explicita:

```json
{
  "web": {
    "allowlist": ["regex:^https://docs\\.example\\.com/(guides|reference)"]
  }
}
```

## Politica MCP

Ferramentas MCP sao externas ao runtime do DeepCode. Por isso, `permissions.mcp` usa `ask` por default e `deepcode run --yes` nao aprova chamadas MCP automaticamente. Em automacao nao interativa, use uma destas opcoes:

- permitir uma ferramenta especifica e confiavel: `mcpPermissions.github__list_issues = "allow"`
- aprovar explicitamente no comando: `deepcode run "..." --yes --allow-dangerous`

As chaves de `mcpPermissions` usam o formato `<server>__<tool>`, igual ao nome da ferramenta exposto ao agente.

```json
{
  "permissions": {
    "mcp": "ask"
  },
  "mcpPermissions": {
    "github__list_issues": "allow",
    "github__create_issue": "ask"
  }
}
```

## Telemetria

`telemetry.enabled` controla a coleta local de estatisticas da sessao. Quando habilitada, DeepCode persiste historico local em `.deepcode/telemetry` e a TUI pode exportar snapshots em JSON por sessao.

## Validacao

O schema de configuracao e estrito. Chaves desconhecidas ou tipos invalidos falham em `doctor`, `run`, `chat` e nos comandos `config`, evitando typos silenciosos.

Antes de depender de uma configuracao nova, rode:

```bash
deepcode doctor
```

## GitHub OAuth

`deepcode github login` usa o OAuth device flow real do GitHub:

```bash
deepcode github login --client-id "github-oauth-app-client-id" --scope repo
deepcode github whoami
```

DeepCode nao embute client ID. Crie um OAuth app com Device Flow habilitado e informe o `client_id` por `--client-id`, `GITHUB_OAUTH_CLIENT_ID` ou `github.oauthClientId`.
