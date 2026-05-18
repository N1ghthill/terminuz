# 03 - Stack Tecnológica

## Baseado na Análise do OpenCode CLI

Esta stack foi definida após análise profunda do OpenCode CLI e considerando:
- Performance (latência foi problema em Python)
- Compatibilidade com arquitetura do OpenCode
- Madurez do ecossistema Node.js

## Tecnologias Principais

### Runtime e Linguagem

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| **Node.js** | 22+ | Runtime JavaScript/TypeScript |
| **TypeScript** | 5.5+ | Type safety e DX |
| **pnpm** | 9+ | Gerenciador de pacotes (workspaces) |

**Por que Node.js 22+?**
- Performance de I/O superior
- Native fetch API
- Compatibilidade com dependências modernas da TUI (Ink 7+)
- Top-level await

### Monorepo e Build

| Tecnologia | Propósito |
|------------|-----------|
| **Turborepo** | Orquestração de builds |
| **tsup** | Bundler rápido para TypeScript |
| **pnpm workspaces** | Gerenciamento de pacotes monorepo |

**Estrutura:**
```
deepcode/
├── packages/
│   ├── core/          # SDK Core
│   ├── cli/           # TUI Interface
│   └── shared/        # Types compartilhados
├── apps/
│   └── deepcode/      # Executável
└── turbo.json
```

### State Management e Reatividade

| Tecnologia | Propósito | Baseado no OpenCode |
|------------|-----------|---------------------|
| **Effect** | 3.12.x | Runtime do core, composição assíncrona e tratamento explícito de erro | ✅ Parcial |
| **Zustand** | 5.x | Estado da TUI e coordenação de UI local | ❌ Divergiu |

**Por que Effect?**
- Functional programming (como Elm, Haskell)
- Error handling explícito (não try/catch)
- Concurrency control integrado
- Type-safe
- Composição de efeitos

**Exemplo:**
```typescript
import { Effect } from 'effect';

const program = Effect.gen(function*() {
  const config = yield* ConfigService.get();
  const result = yield* Tool.execute(config);
  return result;
});

// Execução
const result = await Effect.runPromise(program);
```

### Interface TUI

| Tecnologia | Propósito |
|------------|-----------|
| **Ink** | 4.4+ | Framework React para terminal |
| **React** | 18+ | Base do Ink |
| **ink-text-input** | Input controlado para a experiência de chat |

**Alternativa considerada:** OpenTUI (Solid.js) - usado pelo OpenCode, mas Ink tem:
- Mais documentação
- Maior comunidade
- Mais exemplos
- API mais estável

### Validação e Tipos

| Tecnologia | Propósito | Baseado no OpenCode |
|------------|-----------|---------------------|
| **Zod** | 3.24.x | Schema validation, type inference | ✅ Igual |

**Exemplo:**
```typescript
import { z } from 'zod';

const ToolSchema = z.object({
  name: z.string(),
  parameters: z.record(z.any()),
});

type Tool = z.infer<typeof ToolSchema>;
```

### Search e Code Intelligence

| Tecnologia | Propósito | Baseado no OpenCode |
|------------|-----------|---------------------|
| **ripgrep (rg)** | Busca texto rápida | ✅ Igual |
| **LSP Client** | Busca simbólica | ✅ Igual |
| **Parsing orientado a heurísticas locais** | Ferramentas de análise de código do runtime | ✅ Similar |

**Por que sem Vector DB?**
Análise do OpenCode mostrou que:
- ripgrep é mais rápido para texto
- LSP fornece busca semântica
- Sem overhead de embeddings
- Funciona offline
- Menor memória

### Git e GitHub

| Tecnologia | Propósito |
|------------|-----------|
| **CLI `git` via `execFile`** | Operações Git locais |
| **Cliente GitHub próprio sobre `fetch`** | GitHub.com e GitHub Enterprise |

### HTTP e APIs

| Tecnologia | Propósito |
|------------|-----------|
| **`fetch` nativo do Node 22+** | Providers OpenAI-compatible, web fetch e GitHub |
| **SSE parser próprio** | Streaming de respostas dos providers |

### Testes

| Tecnologia | Propósito |
|------------|-----------|
| **Vitest** | 2.1.x | Test runner principal |
| **ink-testing-library** | Testes da TUI |
| **Servidores HTTP locais e fixtures temporárias** | E2E e testes de integração |

**Por que Vitest?**
- Mais rápido que Jest
- Suporte TypeScript nativo
- API similar ao Jest
- Hot reload

### CLI e Utilitários

| Tecnologia | Propósito |
|------------|-----------|
| **commander** | Parsing de argumentos CLI |
| **chalk** | Cores no terminal |
| **atomic file helpers próprios** | Persistência segura de config/sessões/cache |

### Logging

| Tecnologia | Propósito |
|------------|-----------|
| **Audit log JSONL próprio** | Rastreamento de permissões e ações locais |
| **TelemetryCollector próprio** | Métricas de sessão e exportação |

## Resumo das Dependências

```json
{
  "dependencies": {
    "effect": "^3.12.7",
    "zod": "^3.24.1",
    "ink": "^4.4.1",
    "react": "^18.3.1",
    "commander": "^12.1.0",
    "zustand": "^5.0.3",
    "ink-text-input": "^5.0.1",
    "chalk": "^5.4.1"
  },
  "devDependencies": {
    "@types/node": "^22.19.19",
    "@types/react": "^18.3.12",
    "typescript": "^5.7.2",
    "tsup": "^8.3.5",
    "vitest": "^2.1.8",
    "turbo": "^2.3.3",
    "eslint": "^9.17.0",
    "prettier": "^3.4.2"
  }
}
```

## Justificativas das Escolhas

### Por que não usar...

**LangChain/LangChain.js?**
- Adiciona camada de abstração desnecessária
- OpenCode não usa
- Queremos controle total
- Implementação direta é mais simples

**Vector DB (Chroma/LanceDB/Pinecone)?**
- OpenCode não usa
- ripgrep + LSP é mais rápido
- Menos dependências
- Sem necessidade de embeddings

**Redux/Zustand?**
- O runtime central continua baseado em Effect
- A TUI atual usa Zustand porque simplifica coordenação de estado local em Ink/React
- A divergência é intencional no código atual e deve ser considerada documentação do estado real, não do design aspiracional

**Native binary (pkg/nexe)?**
- NPM é mais simples
- Updates automáticos
- Menor tamanho inicial
- Instalação padrão

## Compatibilidade

### Node.js Version Support
- **Minimum**: Node.js 22.0.0
- **Recommended**: Node.js 22 LTS ou mais recente
- **Tested**: Node.js 22.x

### Plataformas
- ✅ Linux (x64, arm64)
- ✅ macOS (x64, arm64)
- ✅ Windows (x64)

### GitHub Integration
- GitHub.com (OAuth ou PAT)
- GitHub Enterprise (configurável)

---

**Anterior**: [02 - Arquitetura - 6 Camadas](./02-architecture-overview.md)  
**Próximo**: [04 - Fases de Implementação](./04-implementation-phases.md)
