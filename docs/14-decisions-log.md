# 14 - Log de Decisões

## Visão Geral

Este documento registra todas as decisões arquiteturais importantes tomadas durante o planejamento do DeepCode, incluindo contexto, alternativas consideradas e justificativas.

## ADR-001: Linguagem e Runtime

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Precisávamos escolher a stack tecnológica base para o projeto. O usuário mencionou que experimentou latência com Python em implementações anteriores.

### Decisão
**Node.js 22+ com TypeScript 5.5+**

### Alternativas Consideradas

#### 1. Python
- **Prós**: Ecossistema maduro para AI (LangChain, LlamaIndex), muitos exemplos
- **Contras**: Latência (experiência negativa do usuário), GIL limita concorrência
- **Veredito**: ❌ Rejeitado por problemas de performance

#### 2. Rust
- **Prós**: Performance máxima, segurança de memória
- **Contras**: Curva de aprendizado íngreme, menos bibliotecas para LLM
- **Veredito**: ❌ Rejeitado por complexidade

#### 3. Go
- **Prós**: Performance boa, concorrência nativa
- **Contras**: Menos ecossistema para LLM, tipagem menos expressiva
- **Veredito**: ❌ Rejeitado

#### 4. Node.js/TypeScript ✅
- **Prós**: 
  - Experiência do usuário foi positiva ("refatoro em node e fica bom")
  - Event loop excelente para I/O
  - TypeScript oferece type safety
  - Ecossistema vasto
  - Fácil distribuição via NPM
- **Contras**: Single-threaded (mitigado por async/await)
- **Veredito**: ✅ **Aceito**

### Consequências
- Stack moderna com TypeScript strict
- Acesso nativo a APIs do sistema (fs, child_process)
- Melhor DX (Developer Experience)
- Distribuição simplificada

---

## ADR-002: Framework de TUI

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Interface exclusiva via terminal, sem GUI/web. Precisamos de um framework moderno e maduro.

### Decisão
**Ink (React para terminal)**

### Alternativas Consideradas

#### 1. Blessed
- **Prós**: Clássico, estável
- **Contras**: API antiga, menos ativo
- **Veredito**: ❌ Rejeitado

#### 2. OpenTUI (usado pelo OpenCode)
- **Prós**: Baseado em Solid.js, muito performático
- **Contras**: Menos documentação, menos exemplos
- **Veredito**: ❌ Rejeitado (apesar de ser usado pelo OpenCode)

#### 3. Ink ✅
- **Prós**: 
  - API React familiar
  - Documentação excelente
  - Grande comunidade
  - Muitos exemplos
  - Ecossistema de componentes
- **Contras**: Ligeiramente menos performático que OpenTUI
- **Veredito**: ✅ **Aceito**

### Consequências
- Curva de aprendizado menor para devs React
- Componentização facilitada
- Boa documentação para referência

---

## ADR-003: Sistema de Busca

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Necessidade de busca eficiente no codebase. Análise do OpenCode revelou que não usam vector embeddings.

### Decisão
**Ripgrep + LSP (sem Vector DB)**

### Alternativas Consideradas

#### 1. ChromaDB
- **Prós**: Fácil de usar, embeddings automáticos
- **Contras**: Overhead de indexação, memória adicional
- **Veredito**: ❌ Rejeitado

#### 2. LanceDB
- **Prós**: Embeddings, busca vetorial
- **Contras**: Complexidade adicional
- **Veredito**: ❌ Rejeitado

#### 3. Ripgrep + LSP ✅
- **Prós**: 
  - Muito mais rápido (igual OpenCode)
  - Sem overhead de embeddings
  - Funciona offline
  - Menor memória
  - Busca semântica via LSP
- **Contras**: Não tem "understanding" semântico profundo
- **Veredito**: ✅ **Aceito** (igual OpenCode)

### Consequências
- Sem dependências pesadas de ML
- Startup mais rápido
- Funciona em qualquer máquina

---

## ADR-004: Gerenciamento de Estado

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Análise do OpenCode revelou uso de Effect (biblioteca funcional).

### Decisão
**Effect + Solid.js signals**

### Alternativas Consideradas

#### 1. Redux Toolkit
- **Prós**: Muito maduro, dev tools excelentes
- **Contras**: Boilerplate, não segue paradigma funcional
- **Veredito**: ❌ Rejeitado

#### 2. Zustand
- **Prós**: Simples, leve
- **Contras**: Menos poderoso para casos complexos
- **Veredito**: ❌ Rejeitado

#### 3. RxJS
- **Prós**: Poderoso para streams
- **Contras**: Curva de aprendizado íngreme
- **Veredito**: ❌ Rejeitado

#### 4. Effect ✅
- **Prós**: 
  - Igual ao OpenCode
  - Programação funcional
  - Error handling explícito
  - Type-safe
  - Composição de efeitos
- **Contras**: Paradigma diferente (curva inicial)
- **Veredito**: ✅ **Aceito**

### Consequências
- Código mais previsível
- Error handling robusto
- Testes mais fáceis

---

## ADR-005: Distribuição

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Como distribuir o DeepCode para usuários.

### Decisão
**NPM (npm install -g deepcode)**

### Alternativas Consideradas

#### 1. Binário nativo (pkg/nexe)
- **Prós**: Binário único, fácil de distribuir
- **Contras**: ~100MB, updates manuais
- **Veredito**: ❌ Rejeitado

#### 2. Docker
- **Prós**: Isolamento completo
- **Contras**: Overhead, complexidade
- **Veredito**: ❌ Rejeitado

#### 3. NPM ✅
- **Prós**: 
  - Padrão Node.js
  - Updates automáticos
  - Tamanho menor
  - Instalação familiar
- **Contras**: Requer Node.js instalado
- **Veredito**: ✅ **Aceito**

### Consequências
- `npm install -g deepcode`
- Updates via `npm update -g deepcode`
- Fácil instalação

---

## ADR-006: Estrutura de Projeto

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Organização do código em monorepo ou single repo.

### Decisão
**Monorepo com pnpm workspaces + Turborepo**

### Estrutura
```
deepcode/
├── packages/
│   ├── core/        # SDK Core
│   ├── cli/         # TUI
│   └── shared/      # Types
├── apps/
│   └── deepcode/    # Executable
└── package.json
```

### Justificativa
- Separação de responsabilidades
- Core pode ser usado separadamente
- Build otimizado com Turborepo
- Cache compartilhado

---

## ADR-007: Multi-Provider LLM

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Suporte a múltiplos providers de LLM.

### Decisão
**Suporte nativo a: OpenRouter, Claude, GPT-4, DeepSeek, OpenCode Zen/Go**

### Justificativa
- Falhas de provider são comuns
- Diferentes modelos para diferentes tarefas
- Failover automático
- Escolha do usuário

### Implementação
- Interface `LLMProvider` unificada
- Provider Manager com fallback
- Configuração por provider

---

## ADR-008: Testes LLM

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Como testar integrações com LLM.

### Decisão
**Mocks + Gravação/Replay (cassettes)**

### Estratégia
1. **Unit tests**: Mock total das chamadas LLM
2. **Integration tests**: Gravar/replay respostas
3. **E2E**: Testes limitados (custo)

### Justificativa
- Testes determinísticos
- Rápidos (sem chamadas reais)
- Sem custo de API
- Reprodutíveis

---

## ADR-009: Segurança - Níveis de Operação

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Controle de acesso para operações sensíveis.

### Decisão
**5 Níveis de Operação (0-4)**

| Nível | Operações | Comportamento |
|-------|-----------|---------------|
| 0 | Read | Permitir |
| 1 | Write | Configurável |
| 2 | Git Local | Permitir (log) |
| 3 | Shell | Perguntar |
| 4 | Dangerous | Sempre perguntar |

### Justificativa
- Balanceamento segurança/usabilidade
- Igual padrão OpenCode
- Configurável por usuário

---

## ADR-010: Timeline de Desenvolvimento

### Status
✅ **Aceito** - 06/05/2026

### Contexto
Duração do projeto.

### Decisão
**14 semanas (3.5 meses)**

### Fases
1. Foundation (2 semanas)
2. Core Engine (3 semanas)
3. Search & Tools (2 semanas)
4. Agent Loop (2 semanas)
5. TUI (2 semanas)
6. GitHub & Polish (2 semanas)
7. Release (1 semana)

### Justificativa
- MVP funcional na semana 8
- Versão 1.0 na semana 14
- Buffer para imprevistos
- Documentação inclusa

---

## Resumo de Decisões

| ID | Decisão | Alternativa Rejeitada |
|----|---------|----------------------|
| ADR-001 | Node.js/TypeScript | Python (latência) |
| ADR-002 | Ink | OpenTUI (docs) |
| ADR-003 | ripgrep + LSP | ChromaDB |
| ADR-004 | Effect | Redux/Zustand |
| ADR-005 | NPM | Binário nativo |
| ADR-006 | Monorepo | Single repo |
| ADR-007 | Multi-provider | Provider único |
| ADR-008 | Mocks | Chamadas reais |
| ADR-009 | 5 Níveis | Tudo permitir/negar |
| ADR-010 | 14 semanas | Mais/menos tempo |

---

## Notas

- Todas as decisões foram tomadas com base na análise do OpenCode CLI
- Prioridade: Performance (Node), Usabilidade (Ink), Simplicidade (sem Vector DB)
- Stack final é moderna, madura e produtiva
- Documentação completa serve como guia de implementação

---

**Data**: 06 de Maio de 2026  
**Versão**: 1.0  
**Autor**: DeepCode Project
