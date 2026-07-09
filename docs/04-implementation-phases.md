# 04 - Fases de Implementação

## Timeline Total: 14 Semanas

Esta timeline foi projetada para entregar um MVP funcional na semana 8 e versão 1.0 na semana 14.

---

## 📅 FASE 0: Foundation (Semanas 1-2)

> _"Colocar as fundações sólidas"_

### Objetivos

- Setup completo do monorepo
- Pipeline de build funcionando
- Configuração de desenvolvimento
- Logging estruturado

### Entregáveis

#### Semana 1

- [ ] Estrutura de diretórios monorepo
- [ ] Configuração pnpm workspaces
- [ ] TypeScript strict mode
- [ ] ESLint + Prettier
- [ ] Husky + lint-staged

#### Semana 2

- [ ] Turborepo configurado
- [ ] tsup funcionando
- [ ] Vitest configurado
- [ ] GitHub Actions (CI básico)
- [ ] Pino logger integrado

### Estrutura Esperada

```
terminuz/
├── packages/
│   ├── core/package.json
│   ├── cli/package.json
│   └── shared/package.json
├── apps/terminuz/package.json
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 📅 FASE 1: Core Engine (Semanas 3-5)

> _"O coração do agente"_

### Objetivos

- Sistema de providers multi-LLM
- Tool system type-safe
- Session management
- Permission system básico

### Entregáveis

#### Semana 3: Provider Abstraction

- [ ] Interface LLMProvider
- [ ] OpenRouterProvider
- [ ] AnthropicProvider
- [ ] OpenAIProvider
- [ ] DeepSeekProvider
- [ ] Failover automático

#### Semana 4: Tool System

- [ ] Tool interface com Zod
- [ ] ToolRegistry
- [ ] read_file tool
- [ ] write_file tool
- [ ] edit_file tool
- [ ] Tool context

#### Semana 5: Security & State

- [ ] Permission gateway básico
- [ ] Path whitelist/blacklist
- [ ] Session manager (in-memory)
- [ ] Audit logger
- [ ] Effect integration

### Ferramentas Implementadas

```typescript
// Fase 1
- read_file(path, offset?, limit?)
- write_file(path, content)
- edit_file(path, oldString, newString)
- list_dir(path)
- grep(pattern, path?)
```

---

## 📅 FASE 2: Search & Tools (Semanas 6-7)

> _"Capacidades de código"_

### Objetivos

- Sistema de busca (ripgrep + LSP)
- Ferramentas de código
- Integração Git

### Entregáveis

#### Semana 6: Search System

- [ ] Ripgrep integration
- [ ] File search
- [ ] Text search
- [ ] LSP client setup
- [ ] Symbol search

#### Semana 7: Code Tools + Git

- [ ] analyze_code tool
- [ ] lint tool
- [ ] test tool
- [ ] git status/diff
- [ ] git commit/branch

### Ferramentas Implementadas

```typescript
// Fase 2
- search_text(pattern, path?)
- search_files(query)
- search_symbols(query)
- analyze_code(path, type)
- lint(path, fix?)
- test(pattern?, watch?)
- git(operation, args?)
```

---

## 📅 FASE 3: Agent Loop (Semanas 8-9)

> _"O cérebro do agente"_

### Objetivos

- Loop principal do agente
- Task planner
- Workflow engine
- Subagent system

### Entregáveis

#### Semana 8: Core Loop

- [ ] Agent class
- [ ] Main execution loop
- [ ] Tool calling
- [ ] Response parsing
- [ ] Streaming support

#### Semana 9: Planning & Workflows

- [ ] Task planner
- [ ] Task decomposition
- [ ] Workflow: Chain
- [ ] Workflow: Parallel
- [ ] Subagent manager

### Funcionalidades

```typescript
// Capacidades Fase 3
- Decompor tarefas complexas
- Executar workflows
- Delegar para subagentes
- Loop: plan → execute → observe
```

---

## 📅 FASE 4: TUI Interface (Semanas 10-11)

> _"A cara do Terminuz"_

### Objetivos

- Interface Ink completa
- Multi-panel layout
- Keybindings
- Temas

### Entregáveis

#### Semana 10: Core TUI

- [ ] Ink app structure
- [ ] Chat panel
- [ ] Input handling
- [ ] Message streaming
- [ ] Status panel

#### Semana 11: Advanced TUI

- [ ] Activity log panel
- [ ] Approval modal
- [ ] Theme system
- [ ] Keybindings (vim-style)
- [ ] Session switcher

### Layout Final

```
┌──────────────────────────────┬──────────────────────────────────────┐
│                              │  🔄 Status: Executando...            │
│  💬 Chat                     │  ──────────────────────────────────  │
│                              │  📋 Atividades:                      │
│  > Comando do usuário        │  • ✅ Lendo arquivo                  │
│                              │  • ✏️ Editando arquivo               │
│  Resposta do agente...       │  • 🔄 Executando testes              │
│                              │                                      │
│  [Progresso: 80%]            │  ⚠️ Pendentes (1):                   │
│                              │  [!] git push origin main            │
│                              │      [A]provar  [D]enegar            │
└──────────────────────────────┴──────────────────────────────────────┘
```

---

## 📅 FASE 5: GitHub & Polish (Semanas 12-13)

> _"Integração profissional"_

### Objetivos

- GitHub API completa
- Error recovery
- Performance
- Segurança refinada

### Entregáveis

#### Semana 12: GitHub Integration

- [ ] GitHub auth (OAuth/PAT)
- [ ] List issues
- [ ] Get issue details
- [ ] Create PR
- [ ] Solve issue workflow

#### Semana 13: Polish

- [ ] Error recovery
- [ ] Retry logic
- [ ] Performance optimization
- [ ] Permission refinement
- [ ] Cache layer

### Funcionalidades

```typescript
// GitHub
-github.list_issues() -
  github.get_issue(number) -
  github.create_pr(title, body, head, base) -
  github.solve_issue(number); // Workflow completo
```

---

## 📅 FASE 6: Release (Semana 14)

> _"Pronto para produção"_

### Objetivos

- Testes completos
- Documentação
- NPM publish
- Release v1.0

### Entregáveis

#### Semana 14

- [ ] Test suite > 80% coverage
- [ ] Testes E2E
- [ ] Documentação completa
- [ ] README com exemplos
- [ ] NPM package publicado
- [ ] GitHub release criado

### Checklist de Release

```
✅ Todas as ferramentas implementadas
✅ TUI funcionando
✅ GitHub integration
✅ Testes passando
✅ Documentação completa
✅ NPM install funcionando
✅ GitHub release
```

---

## 📊 Resumo por Fase

| Fase | Semanas | Foco Principal | Entregável Chave        |
| ---- | ------- | -------------- | ----------------------- |
| 0    | 1-2     | Setup          | Monorepo funcional      |
| 1    | 3-5     | Core           | Tool system + Providers |
| 2    | 6-7     | Search         | ripgrep + LSP           |
| 3    | 8-9     | Agent          | Loop + Workflows        |
| 4    | 10-11   | TUI            | Interface visual        |
| 5    | 12-13   | GitHub         | Integração completa     |
| 6    | 14      | Release        | v1.0 publicado          |

---

## 🎯 Marcos Importantes

### Semana 4 (MVP Técnico)

- Providers funcionando
- Tools básicas operacionais
- Testes unitários

### Semana 8 (MVP Funcional)

- Agente consegue: ler, escrever, editar arquivos
- Loop de execução funcionando
- Sem TUI ainda (CLI básico)

### Semana 11 (Beta)

- TUI completa
- Todas as ferramentas
- GitHub básico

### Semana 14 (v1.0)

- Produção ready
- Documentação completa
- NPM publicado

---

## ⚠️ Riscos e Mitigações

| Risco                   | Probabilidade | Mitigação                         |
| ----------------------- | ------------- | --------------------------------- |
| Atraso em TUI           | Média         | Começar TUI mais cedo se possível |
| Problemas com Effect    | Baixa         | Ter fallback para async/await     |
| Integração LSP complexa | Média         | Fazer sem LSP inicialmente        |
| Performance ruim        | Baixa         | Benchmarks semanais               |

---

**Anterior**: [03 - Stack Tecnológica](./03-technology-stack.md)  
**Próximo**: [05 - Design da TUI](./05-tui-design.md)
