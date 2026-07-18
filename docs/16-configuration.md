# 16 - Configuracao

## Visao Geral

Terminuz carrega configuracao preferencial de `.terminuz/config.json`, usa `.deepcode/config.json` como fallback legado e aplica overrides de ambiente em runtime. O comando `terminuz config` edita o arquivo preferencial; valores vindos de ambiente podem ser inspecionados com `--effective`, mas nao sao gravados no disco.

Chaves de provedores e tokens GitHub nao sao gravados no projeto. O Terminuz usa um armazenamento global do usuario com uma entrada isolada por projeto. No Linux, o caminho padrao e `~/.config/terminuz/credentials.json`; no macOS, `~/Library/Application Support/terminuz/credentials.json`; no Windows, `%APPDATA%\terminuz\credentials.json`. O diretorio recebe modo `0700` e o arquivo `0600` nas plataformas POSIX.

Ao encontrar `apiKey` ou `github.token` em `.terminuz/config.json` ou `.deepcode/config.json`, o carregador grava primeiro o armazenamento protegido, remove os segredos do arquivo de projeto, limpa `cache/` e `tmp/` e mascara copias exatas em sessoes, telemetria e logs. A entrada global usa um identificador aleatorio e nao secreto salvo em `.terminuz/credential-scope`, preservando credenciais diferentes para projetos diferentes mesmo quando um diretorio e movido.

Variaveis de ambiente sensiveis sao consumidas pelo runtime do Terminuz, mas
nao sao encaminhadas a processos filhos iniciados por shell, Git, LSP ou outras
tools do agente.

Secrets sao mascarados em `config show`, `config get`, erros da CLI, output do agente, telemetry export e logs de auditoria.

## Ordem de Precedencia

1. Arquivo passado explicitamente por `--config`.
2. Variaveis `TERMINUZ_*`.
3. Aliases legados `DEEPCODE_*`.
4. armazenamento seguro de credenciais do usuario, para chaves e tokens;
5. `.terminuz/config.json`;
6. `.deepcode/config.json`, quando o arquivo preferencial nao existe;
7. `apiKeyFile`, para chaves de provedores;
8. defaults do schema compartilhado.

Variaveis aplicadas no runtime:

- `TERMINUZ_PROVIDER` (fallback: `DEEPCODE_PROVIDER`)
- `TERMINUZ_MODEL` (fallback: `DEEPCODE_MODEL`)
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
- `TERMINUZ_THEME` (fallback: `DEEPCODE_THEME`)
- `TERMINUZ_COMPACT` (fallback: `DEEPCODE_COMPACT`)
- `TERMINUZ_SESSION_DIR` (fallback: `DEEPCODE_SESSION_DIR`)

## Smoke Test Anthropic

O teste ao vivo e opcional e nunca exige uma chave no CI. Informe a chave sem
grava-la no historico do shell e escolha um modelo disponivel no projeto:

```bash
read -rsp "Anthropic API key: " ANTHROPIC_API_KEY
echo
export ANTHROPIC_API_KEY
ANTHROPIC_MODEL=claude-sonnet-4-6 pnpm --filter @terminuz/core test:anthropic:live
unset ANTHROPIC_API_KEY
```

Sem `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`, o teste permanece ignorado no gate
local e no CI.

## Comandos Principais

```bash
terminuz config path
terminuz config credentials-path
terminuz config show
terminuz config show --effective
terminuz config get defaultProvider
terminuz config get defaultModels.deepseek
terminuz config set defaultProvider deepseek
terminuz config set defaultModels.deepseek "deepseek-v4-flash"
terminuz config set modeDefaults.plan.provider deepseek
terminuz config set modeDefaults.plan.model deepseek-reasoner
terminuz config set modeDefaults.build.provider openrouter
terminuz config set buildTurnPolicy.mode heuristic
terminuz config set providers.deepseek.apiKey "..."
terminuz config set providers.deepseek.apiKeyFile "~/.config/deepseek.key"
terminuz config set github.oauthClientId "..."
terminuz config set github.oauthScopes '["repo"]'
terminuz config set cache.enabled false
terminuz config set cache.ttlSeconds 600
terminuz config set permissions.allowShell '["pnpm test","pnpm build","git status"]'
terminuz config set permissions.mcp ask
terminuz config set mcpPermissions.github__list_issues allow
terminuz config set paths.whitelist '["${WORKTREE}/**","/tmp/**"]'
terminuz config set web.allowlist '["docs.example.com","*.trusted.example.com"]'
terminuz config unset modeDefaults.plan.model
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
      "apiKeyFile": "~/.config/terminuz/deepseek.key"
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
    "allowShell": ["git status", "git diff", "pnpm test", "pnpm build"]
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
- por default, Terminuz opera apenas dentro de `${WORKTREE}/**`
- em modo nao interativo, `--yes` nao aprova automaticamente paths fora da whitelist; use `--yes --allow-outside-worktree` apenas quando confiar explicitamente no caminho.

Exemplos:

```bash
terminuz run "fix local tests" --yes
terminuz run "read /tmp/fixture-output" --yes --allow-outside-worktree
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

Ferramentas MCP sao externas ao runtime do Terminuz. Por isso, `permissions.mcp` usa `ask` por default e `terminuz run --yes` nao aprova chamadas MCP automaticamente. Em automacao nao interativa, use uma destas opcoes:

- permitir uma ferramenta especifica e confiavel: `mcpPermissions.github__list_issues = "allow"`
- aprovar explicitamente no comando: `terminuz run "..." --yes --allow-dangerous`

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

`telemetry.enabled` controla a coleta local de estatisticas da sessao. Quando habilitada, Terminuz persiste historico local em `.terminuz/telemetry` e a TUI pode exportar snapshots em JSON por sessao.

## Validacao

O schema de configuracao e estrito. Chaves desconhecidas ou tipos invalidos falham em `doctor`, `run`, `chat` e nos comandos `config`, evitando typos silenciosos.

Antes de depender de uma configuracao nova, rode:

```bash
terminuz doctor
```

## GitHub OAuth

`terminuz github login` usa o OAuth device flow real do GitHub:

```bash
terminuz github login --client-id "github-oauth-app-client-id" --scope repo
terminuz github whoami
```

Terminuz nao embute client ID. Crie um OAuth app com Device Flow habilitado e informe o `client_id` por `--client-id`, `GITHUB_OAUTH_CLIENT_ID` ou `github.oauthClientId`.
