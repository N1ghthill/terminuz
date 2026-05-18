# 01 - Visão e Requisitos

## Data do Documento
06 de Maio de 2026

## Visão do Produto

DeepCode é um agente de codificação AI profissional, projetado para ser um assistente de desenvolvimento completo que opera via terminal. Diferente de assistentes simples de autocompletar, o DeepCode possui capacidade de:

- Entender requisitos complexos em linguagem natural
- Planejar e executar tarefas de desenvolvimento multi-etapas
- Navegar e modificar codebases completos
- Usar ferramentas de desenvolvimento (git, testes, lint)
- Iterar com base em feedback do ambiente

## Requisitos Funcionais

### RF1 - Interface TUI (Terminal User Interface)
- Interface exclusiva via terminal
- Sem GUI, web ou IDE integration
- Suporte a keybindings estilo Vim
- Layout multi-painel (chat, status, atividades, aprovações)
- Temas customizáveis

### RF2 - Multi-Provider LLM
Suporte obrigatório aos providers:
- OpenRouter
- Anthropic (Claude)
- OpenAI (GPT-4)
- DeepSeek
- OpenCode Zen/Go

**Características:**
- Failover automático entre providers
- Seleção de modelo por tarefa
- Configuração de API keys independente

### RF3 - Autonomia Controlada
- Capacidade de modificar arquivos
- Executar comandos shell
- Operações git (commit, push, branch)
- Execução de testes
- Todas as operações sensíveis requerem aprovação

### RF4 - Integração GitHub
- Leitura de issues
- Criação de branches
- Commits e push
- Criação de Pull Requests
- Resolução automática de issues simples

### RF5 - Capacidades de Código
- Leitura e edição de arquivos
- Busca no codebase (texto e simbólica)
- Análise AST
- Execução de testes
- Linting
- Suporte a múltiplas linguagens

## Requisitos Não-Funcionais

### RNF1 - Performance
- Baixa latência (experiência do usuário com Python foi ruim)
- Resposta rápida da TUI
- Streaming de respostas do LLM

### RNF2 - Segurança
- Path whitelist/blacklist
- Níveis de permissão granulares
- Audit logging completo
- Aprovação para operações sensíveis
- Nunca executar sem aprovação: rm -rf, git push --force, etc.

### RNF3 - Confiabilidade
- Recuperação de erros
- Retry automático com backoff
- Graceful degradation

### RNF4 - Usabilidade
- Comandos intuitivos
- Feedback visual claro
- Progress indicators
- Histórico de sessões

## Restrições

1. **Runtime**: Node.js 22+ apenas
2. **Interface**: TUI exclusiva (sem GUI/web)
3. **Execução**: Local (não cloud)
4. **Distribuição**: NPM (não binário standalone)

## Casos de Uso Principais

### UC1 - Desenvolvimento de Feature
```
Usuário: "Adicione autenticação JWT ao projeto"
Agente: Analisa → Planeja → Implementa → Testa → Commit
```

### UC2 - Resolução de Issue GitHub
```
Usuário: "Resolva a issue #42"
Agente: Lê issue → Analisa → Cria branch → Implementa → PR
```

### UC3 - Refatoração
```
Usuário: "Refatore o módulo de users para usar TypeScript"
Agente: Analisa → Converte → Testa → Commit
```

### UC4 - Debug
```
Usuário: "Os testes estão falhando"
Agente: Roda testes → Analisa erro → Corrige → Verifica
```

## Critérios de Sucesso

- [ ] Agente consegue implementar feature simples end-to-end
- [ ] Resolução de issues GitHub com sucesso > 70%
- [ ] Latência < 2s para respostas simples
- [ ] Zero operações não-autorizadas em modo restrito
- [ ] Suporte a projetos TypeScript/JavaScript/Python

## Referências

- [Building Effective Agents - Anthropic](https://www.anthropic.com/research/building-effective-agents)
- [OpenCode CLI](https://opencode.ai) - Inspiração principal
- [SWE-agent](https://github.com/princeton-nlp/SWE-agent) - Referência acadêmica

---

**Próximo**: [02 - Arquitetura - 6 Camadas](./02-architecture-overview.md)
