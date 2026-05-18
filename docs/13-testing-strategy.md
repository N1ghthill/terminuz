# 13 - Estratégia de Testes

## Visão Geral

DeepCode segue uma estratégia de testes abrangente, com foco em testes unitários, integração e end-to-end. A arquitetura baseada em Effect facilita a criação de testes determinísticos e paralelizáveis.

## Pirâmide de Testes

```
         /\
        /  \
       / E2E \          ← Poucos testes (cenarios críticos)
      /________\
     /          \
    / Integration \     ← Testes de integração
   /________________\
  /                  \
 /    Unit Tests      \  ← Maioria dos testes
/______________________\
```

- **Unit Tests**: 70% - Testes rápidos, isolados
- **Integration Tests**: 25% - Testes de componentes integrados
- **E2E Tests**: 5% - Fluxos completos

## Stack de Testes

| Ferramenta | Propósito |
|------------|-----------|
| **Vitest** | Test runner (substitui Jest) |
| **@effect/vitest** | Integração Effect + Vitest |
| **MSW** | Mock de APIs HTTP |
| **@solidjs/testing-library** | Testes de componentes Solid/Ink |
| **c8** | Coverage reporting |

## Testes Unitários

### Padrão Básico
```typescript
import { describe, it, expect } from 'vitest';
import { Effect } from 'effect';

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = createToolRegistry();
    const tool = createMockTool('test');
    
    registry.register(tool);
    
    expect(registry.get('test')).toBe(tool);
  });
  
  it('should return undefined for unknown tools', () => {
    const registry = createToolRegistry();
    
    expect(registry.get('unknown')).toBeUndefined();
  });
});
```

### Testes com Effect
```typescript
import { Effect, Exit } from 'effect';

describe('SessionService', () => {
  it('should create session successfully', async () => {
    const program = Effect.gen(function*() {
      const service = yield* SessionService;
      const session = yield* service.create('/test/project');
      
      expect(session.worktree).toBe('/test/project');
      expect(session.status).toBe('idle');
      
      return session;
    });
    
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(SessionServiceLive))
    );
    
    expect(result.id).toBeDefined();
  });
  
  it('should handle errors gracefully', async () => {
    const program = Effect.gen(function*() {
      const service = yield* SessionService;
      yield* service.get('non-existent-id');
    });
    
    const exit = await Effect.runPromiseExit(
      program.pipe(Effect.provide(SessionServiceLive))
    );
    
    expect(Exit.isFailure(exit)).toBe(true);
  });
  
  it('should retry on transient errors', async () => {
    let attempts = 0;
    
    const flakyEffect = Effect.tryPromise({
      try: () => {
        attempts++;
        if (attempts < 3) throw new Error('Transient');
        return 'success';
      },
      catch: (e) => new Error(String(e)),
    });
    
    const result = await Effect.runPromise(
      flakyEffect.pipe(Effect.retry({ times: 3 }))
    );
    
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});
```

### Mocks

```typescript
// Mock de Provider LLM
const createMockLLM = (responses: string[]): LLMProvider => ({
  id: 'mock',
  name: 'Mock Provider',
  async *chat() {
    for (const response of responses) {
      yield { type: 'delta', content: response };
    }
  },
  async complete(prompt) {
    return responses[0] || 'mock response';
  },
  async listModels() {
    return [{ id: 'mock-model', name: 'Mock' }];
  },
  async validateConfig() {
    return true;
  },
});

// Mock de Tool
const createMockTool = (name: string): Tool<any, any> => ({
  name,
  description: `Mock ${name}`,
  parameters: z.object({}),
  execute: () => Effect.succeed(`Executed ${name}`),
});
```

## Testes de Integração

### Teste de Tool com Filesystem
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtemp, writeFile, readFile } from 'fs/promises';
import { join } from 'path';

describe('read_file tool', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'deepcode-test-'));
  });
  
  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });
  
  it('should read file content', async () => {
    const filePath = join(tempDir, 'test.txt');
    await writeFile(filePath, 'Hello World');
    
    const result = await Effect.runPromise(
      readFileTool.execute({ path: filePath }, mockContext)
    );
    
    expect(result).toContain('Hello World');
  });
  
  it('should respect offset and limit', async () => {
    const filePath = join(tempDir, 'test.txt');
    await writeFile(filePath, 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    
    const result = await Effect.runPromise(
      readFileTool.execute({ path: filePath, offset: 1, limit: 2 }, mockContext)
    );
    
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
    expect(result).not.toContain('Line 1');
    expect(result).not.toContain('Line 5');
  });
});
```

### Teste de Git Operations
```typescript
describe('git tool', () => {
  let tempDir: string;
  let git: SimpleGit;
  
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'git-test-'));
    git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.email', 'test@test.com');
    await git.addConfig('user.name', 'Test');
  });
  
  it('should get git status', async () => {
    await writeFile(join(tempDir, 'file.txt'), 'content');
    
    const result = await Effect.runPromise(
      gitTool.execute({ operation: 'status' }, {
        ...mockContext,
        worktree: tempDir,
      })
    );
    
    expect(result).toContain('file.txt');
  });
});
```

### Teste de Multi-Provider
```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json({
      choices: [{ message: { content: 'OpenAI response' } }],
    });
  }),
  
  http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json({
      content: [{ text: 'Claude response' }],
    });
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ProviderManager', () => {
  it('should fallback to second provider', async () => {
    // Primeiro provider falha
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        return new HttpResponse(null, { status: 500 });
      })
    );
    
    const manager = new ProviderManager({
      anthropic: { apiKey: 'test' },
      openai: { apiKey: 'test' },
      fallbackOrder: ['anthropic', 'openai'],
    });
    
    const chunks: string[] = [];
    for await (const chunk of manager.chat([{ role: 'user', content: 'test' }])) {
      if (chunk.type === 'delta') {
        chunks.push(chunk.content);
      }
    }
    
    expect(chunks.join('')).toBe('OpenAI response');
  });
});
```

## Testes End-to-End

### Fluxo Completo
```typescript
describe('E2E: Complete Workflow', () => {
  it('should create file and commit', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'e2e-test-'));
    
    // Setup
    const git = simpleGit(tempDir);
    await git.init();
    await git.addConfig('user.email', 'test@test.com');
    await git.addConfig('user.name', 'Test');
    
    const session = await sessionManager.create({ worktree: tempDir });
    
    // Execute
    await agent.run(session.id, 'Create a file called hello.txt with content "Hello World"');
    
    // Verify
    const content = await readFile(join(tempDir, 'hello.txt'), 'utf-8');
    expect(content).toBe('Hello World');
    
    const status = await git.status();
    expect(status.created).toContain('hello.txt');
    
    // Cleanup
    await rm(tempDir, { recursive: true });
  }, 30000); // 30s timeout
});
```

### Testes com Snapshots
```typescript
describe('Session serialization', () => {
  it('should serialize session correctly', () => {
    const session = Session.create({
      worktree: '/test',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ],
    });
    
    expect(session.toJSON()).toMatchSnapshot();
  });
});
```

## Testes de Componentes (TUI)

```typescript
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';

describe('ChatPanel', () => {
  it('should display messages', () => {
    const { lastFrame } = render(
      <ChatPanel
        messages={[
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ]}
      />
    );
    
    expect(lastFrame()).toContain('Hello');
    expect(lastFrame()).toContain('Hi there!');
  });
  
  it('should handle input submission', () => {
    const onSubmit = vi.fn();
    
    const { stdin } = render(
      <InputBox onSubmit={onSubmit} />
    );
    
    stdin.write('Test message');
    stdin.write('\r'); // Enter
    
    expect(onSubmit).toHaveBeenCalledWith('Test message');
  });
});
```

## Configuração do Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'c8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.d.ts',
        '**/dist/**',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
```

```typescript
// test/setup.ts
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Setup global
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Cleanup global
});
```

## Testes de Performance

```typescript
import { benchmark } from 'vitest';

describe('Performance', () => {
  benchmark('index codebase', async () => {
    const indexer = new CodebaseIndexer();
    await indexer.index('/path/to/project');
  }, { time: 5000 });
  
  benchmark('search query', async () => {
    const engine = new TextSearchEngine();
    await engine.search({
      pattern: 'function',
      path: '/path/to/project',
    });
  }, { iterations: 100 });
});
```

## CI/CD

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [22.x]
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
      
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'pnpm'
      
      - run: pnpm install
      
      - run: pnpm lint
      
      - run: pnpm type-check
      
      - run: pnpm test:coverage
      
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Cobertura Mínima

| Componente | Cobertura |
|------------|-----------|
| Core tools | 90% |
| Providers | 85% |
| Security | 95% |
| TUI | 70% |
| **Total** | **80%** |

---

**Anterior**: [12 - Gerenciamento de Estado](./12-state-management.md)  
**Próximo**: [14 - Log de Decisões](./14-decisions-log.md)
