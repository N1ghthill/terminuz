# Sistema de Aprovação de Comandos - Terminuz

## Visão Geral

O Terminuz agora possui um sistema de aprovação de comandos inspirado no OpenCode, onde o agente **pergunta ao usuário** antes de executar comandos shell, com configuração por agente (build/plan), opção "always" para lembrar decisões permanentemente, e indicador inline no chat.

## Novos Recursos

### 1. Configuração de Permissões por Agente

Cada agente (`build` e `plan`) pode ter suas próprias regras de permissão:

```json
{
  "agentPermissions": {
    "build": {
      "shell": "ask",
      "dangerous": "ask",
      "write": "ask",
      "read": "allow",
      "gitLocal": "allow",
      "askBeforeExecute": false
    },
    "plan": {
      "shell": "ask",
      "dangerous": "deny",
      "write": "deny",
      "read": "allow",
      "gitLocal": "ask",
      "askBeforeExecute": true
    }
  }
}
```

### 2. Opção "Always" (Permanente)

Quando uma aprovação é solicitada, você agora tem 4 opções:

- **A** - Aprovar uma vez (apenas para esta execução)
- **L** - Aprovar **sempre** (permanente, salvo até reiniciar o Terminuz)
- **S** - Aprovar para sessão (válido até fechar a sessão atual)
- **D** - Negar

A opção "always" é útil para comandos que você usa frequentemente e confia completamente.

### 3. Indicador Inline no Chat

Quando uma aprovação está pendente, um indicador aparece inline no chat mostrando:

- O comando/oper ação solicitada
- As opções disponíveis (A/L/S/D)

Isso proporciona melhor visibilidade do estado de aprovação sem precisar olhar para o painel lateral.

## Configuração

### Exemplo de Configuração para Modo Build (Padrão)

```json
{
  "agentPermissions": {
    "build": {
      "shell": "ask",
      "dangerous": "ask",
      "askBeforeExecute": false
    }
  }
}
```

Neste modo:

- Comandos shell normais pedem aprovação
- Comandos perigosos (sudo, rm -rf, etc.) pedem aprovação
- A classificação de risco do comando é respeitada

### Exemplo de Configuração para Modo Plan (Somente Leitura)

```json
{
  "agentPermissions": {
    "plan": {
      "shell": "ask",
      "dangerous": "deny",
      "write": "deny",
      "askBeforeExecute": true
    }
  }
}
```

Neste modo:

- **Todos** os comandos shell pedem aprovação (devido a `askBeforeExecute: true`)
- Comandos perigosos são **negados** automaticamente
- Escrita em arquivos é **negada** automaticamente
- Leitura é permitida

### Opções de Permissão

| Opção              | Descrição                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `shell`            | Permissão para comandos shell normais                                                               |
| `dangerous`        | Permissão para comandos perigosos (sudo, rm -rf, git push --force, etc.)                            |
| `write`            | Permissão para escrita/edição de arquivos                                                           |
| `read`             | Permissão para leitura de arquivos                                                                  |
| `gitLocal`         | Permissão para operações git locais                                                                 |
| `askBeforeExecute` | Se `true`, SEMPRE pergunta antes de executar comandos shell, independente da classificação de risco |

### Valores Permitidos

- `"allow"` - Permite automaticamente
- `"ask"` - Pergunta ao usuário (padrão)
- `"deny"` - Nega automaticamente

## Classificação de Comandos Shell

O Terminuz classifica comandos shell em 3 categorias:

### Blocked (Sempre Negado)

- `rm -rf /`, `rm -rf /*`, `rm -rf ~`
- `shutdown`, `reboot`, `poweroff`, `halt`
- `mkfs`, `dd of=/dev/`, `chmod -R 777 /`

### Dangerous (Requer Aprovação)

- `rm -rf` (em qualquer diretório)
- `git push --force`
- `git reset --hard`
- `sudo`
- `curl | bash`, `wget | bash`

### Shell (Normal)

- Todos os outros comandos

## Fluxo de Aprovação

1. Agente tenta executar um comando
2. Sistema verifica:
   - Está na blacklist? → **Negado**
   - Está no `alwaysAllowSet`? → **Permitido**
   - Está no `sessionAllowSet`? → **Permitido**
   - Configuração do agente permite? → **Permitido**
   - Configuração do agente nega? → **Negado**
3. Se nenhuma regra se aplicar, **pergunta ao usuário**
4. Usuário decide: A (uma vez), L (sempre), S (sessão), D (nega)
5. Decisão é aplicada e comando é executado (ou não)

## Atalhos de Aprovação

| Tecla      | Ação                        |
| ---------- | --------------------------- |
| `A`        | Aprovar uma vez             |
| `L`        | Aprovar sempre (permanente) |
| `S`        | Aprovar para sessão         |
| `D` ou `N` | Negar                       |
| `Esc`      | Negar                       |

## Exemplos de Uso

### Exemplo 1: Configuração Conservadora

```json
{
  "agentPermissions": {
    "build": {
      "shell": "ask",
      "dangerous": "deny",
      "askBeforeExecute": true
    }
  }
}
```

Nesta configuração, **todos** os comandos shell pedem aprovação e comandos perigosos são sempre negados.

### Exemplo 2: Configuração Balanceada

```json
{
  "agentPermissions": {
    "build": {
      "shell": "ask",
      "dangerous": "ask",
      "askBeforeExecute": false
    },
    "plan": {
      "shell": "deny",
      "dangerous": "deny",
      "write": "deny"
    }
  }
}
```

- Build: pergunta antes de executar
- Plan: nega shell e escrita automaticamente

### Exemplo 3: Configuração Permissiva

```json
{
  "agentPermissions": {
    "build": {
      "shell": "allow",
      "dangerous": "ask",
      "askBeforeExecute": false
    }
  }
}
```

- Comandos shell normais são executados automaticamente
- Apenas comandos perigosos pedem aprovação

## Migração

Se você já tem uma configuração existente, não se preocupe! O campo `agentPermissions` é **opcional**. Se não estiver presente, o Terminuz usa as permissões globais definidas em `permissions`.

Para adotar gradualmente:

1. Comece sem `agentPermissions` (comportamento atual)
2. Adicione `agentPermissions.build` com as mesmas configurações de `permissions`
3. Adicione `agentPermissions.plan` para restringir o modo plan
4. Ajuste conforme necessário

## Segurança

- A opção "always" (L) é salva em memória e **não persiste** entre reinícios do Terminuz
- A opção "session" (S) é válida apenas para a sessão atual
- Comandos na blacklist **nunca** são permitidos, independente da aprovação
- Caminhos fora da whitelist ainda requerem aprovação adicional

## Troubleshooting

### "Comando foi negado mas eu não configurei isso"

Verifique:

1. O modo do agente atual (`build` ou `plan`)
2. As permissões específicas do agente em `agentPermissions`
3. Se o comando está na blacklist de paths
4. Se o comando foi classificado como `blocked`

### "Quero que um comando específico seja sempre permitido"

Adicione ao `allowShell`:

```json
{
  "permissions": {
    "allowShell": ["git status", "git diff", "pnpm test"]
  }
}
```

### "Como resetar aprovações 'always'?"

Reinicie o Terminuz. Aprovações "always" são salvas apenas em memória.

## Comparação com OpenCode

| Recurso               | OpenCode | Terminuz    |
| --------------------- | -------- | ----------- |
| Permissões por agente | ✅       | ✅          |
| Opção "always"        | ✅       | ✅          |
| Opção "session"       | ✅       | ✅          |
| Indicador inline      | ✅       | ✅          |
| Painel de aprovação   | ✅       | ✅          |
| Tree-sitter parsing   | ✅       | ❌ (futuro) |
| Regras por padrão     | ✅       | ❌ (futuro) |

## Contribuição

Para contribuir com melhorias no sistema de aprovação:

1. Adicione testes para novos cenários de permissão
2. Documente novas opções de configuração
3. Considere impactos de segurança

## Links Relacionados

- [OpenCode Permission System](https://github.com/anomalyco/opencode/tree/dev/packages/opencode/src/permission)
- [Terminuz Security Model](../06-security-model.md)
