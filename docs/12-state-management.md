# 12 - Gerenciamento de Estado

## Visão Geral

Terminuz utiliza **Effect** como sistema principal de gerenciamento de estado, seguindo o padrão do OpenCode. Effect é uma biblioteca de programação funcional que oferece controle de efeitos colaterais, error handling e concorrência de forma type-safe.

## Por que Effect?

### Problemas com abordagens tradicionais

```typescript
// ❌ Try/catch - não explícito
async function fetchData(): Promise<Data> {
  try {
    const response = await fetch("/api/data");
    if (!response.ok) throw new Error("Failed");
    return await response.json();
  } catch (error) {
    throw error;
  }
}

// ❌ Callbacks aninhadas - callback hell
async function process() {
  try {
    const user = await getUser();
    const posts = await getPosts(user.id);
    const comments = await getComments(posts[0].id);
    return comments;
  } catch (error) {
    // Qual operação falhou?
    throw error;
  }
}
```

### Solução Effect

```typescript
// ✅ Error handling explícito
const fetchData = Effect.tryPromise({
  try: () => fetch("/api/data").then((r) => r.json()),
  catch: (error) => new FetchError(error.message),
});

// ✅ Composição clara
const process = Effect.gen(function* () {
  const user = yield* getUser;
  const posts = yield* getPosts(user.id);
  const comments = yield* getComments(posts[0].id);
  return comments;
});
```

## Conceitos Fundamentais

### 1. Effect Type

```typescript
// Effect<Success, Error, Requirements>
//          ↑        ↑         ↑
//     Valor de    Erros    Serviços
//     sucesso     possíveis necessários

type MyEffect = Effect<string, FetchError, HttpService>;
// Retorna: string
// Pode falhar com: FetchError
// Requer: HttpService
```

### 2. Criação de Effects

```typescript
import { Effect } from "effect";

// Effect síncrono
const syncEffect = Effect.sync(() => {
  return "Hello World";
});

// Effect assíncrono
const asyncEffect = Effect.promise(() => fetch("/api/data").then((r) => r.json()));

// Effect com try/catch
const safeEffect = Effect.tryPromise({
  try: () => fetch("/api/data"),
  catch: (error) => new NetworkError(String(error)),
});

// Effect que falha
const failure = Effect.fail(new Error("Something went wrong"));

// Effect de sucesso
const success = Effect.succeed(42);
```

### 3. Composição com Gen

```typescript
const program = Effect.gen(function* () {
  // 1. Chama primeiro effect
  const user = yield* fetchUser;

  // 2. Validação
  if (!user.isActive) {
    yield* Effect.fail(new UserInactiveError());
  }

  // 3. Chama segundo effect (depende do primeiro)
  const posts = yield* fetchPosts(user.id);

  // 4. Transforma resultado
  return {
    user: user.name,
    postCount: posts.length,
  };
});
```

### 4. Error Handling

```typescript
// Catch específico
const recovered = program.pipe(
  Effect.catchTag("NetworkError", (error) => Effect.succeed({ user: "default", postCount: 0 })),
);

// Catch all
const withFallback = program.pipe(
  Effect.catchAll((error) => Effect.succeed({ user: "error", postCount: 0 })),
);

// Retry
const withRetry = program.pipe(
  Effect.retry({
    schedule: Schedule.exponential("1 second").pipe(Schedule.compose(Schedule.recurs(3))),
  }),
);

// Timeout
const withTimeout = program.pipe(Effect.timeout("5 seconds"));
```

## Arquitetura de Estado

### Session State

```typescript
import { Context, Layer, Effect } from "effect";
import { createStore } from "solid-js/store";

// Modelo
interface Session {
  id: string;
  worktree: string;
  messages: Message[];
  status: "idle" | "planning" | "executing" | "error";
  metadata: Record<string, any>;
}

// Serviço
class SessionService extends Context.Tag("SessionService")<
  SessionService,
  {
    readonly get: (id: string) => Effect.Effect<Session, NotFoundError>;
    readonly save: (session: Session) => Effect.Effect<void>;
    readonly update: (id: string, update: Partial<Session>) => Effect.Effect<void>;
    readonly list: () => Effect.Effect<Session[]>;
  }
>() {}

// Implementação
const SessionServiceLive = Layer.succeed(
  SessionService,
  SessionService.of({
    get: (id) =>
      Effect.sync(() => {
        const session = sessions.get(id);
        if (!session) throw new NotFoundError(id);
        return session;
      }),

    save: (session) =>
      Effect.sync(() => {
        sessions.set(session.id, session);
      }),

    update: (id, update) =>
      Effect.gen(function* () {
        const session = yield* SessionService.get(id);
        yield* SessionService.save({ ...session, ...update });
      }),

    list: () => Effect.sync(() => Array.from(sessions.values())),
  }),
);
```

### Reactive State com Solid

```typescript
import { createStore, produce } from "solid-js/store";
import { makePersisted } from "@solid-primitives/storage";

// Store reativo
const [store, setStore] = createStore({
  sessions: {} as Record<string, Session>,
  currentSession: null as string | null,
  config: defaultConfig,
});

// Persistência opcional
const persisted = makePersisted(store, { name: "terminuz" });

// Ações
const SessionActions = {
  create: (worktree: string) => {
    const id = generateId();
    setStore("sessions", id, {
      id,
      worktree,
      messages: [],
      status: "idle",
    });
    return id;
  },

  addMessage: (sessionId: string, message: Message) => {
    setStore("sessions", sessionId, "messages", (messages) => [...messages, message]);
  },

  updateStatus: (sessionId: string, status: Session["status"]) => {
    setStore("sessions", sessionId, "status", status);
  },
};
```

### Event Bus

```typescript
import { EventEmitter } from "events";
import { Effect } from "effect";

interface AppEvents {
  "session:created": { id: string; worktree: string };
  "session:updated": { id: string; changes: Partial<Session> };
  "message:received": { sessionId: string; message: Message };
  "tool:executed": { sessionId: string; tool: string; result: any };
  "approval:requested": { request: ApprovalRequest };
  "approval:resolved": { requestId: string; allowed: boolean };
  error: { error: Error; context?: any };
}

class EventBus {
  private emitter = new EventEmitter();

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): Effect.Effect<void> {
    return Effect.sync(() => {
      this.emitter.emit(event, data);
    });
  }

  on<K extends keyof AppEvents>(
    event: K,
    handler: (data: AppEvents[K]) => void,
  ): Effect.Effect<() => void> {
    return Effect.sync(() => {
      this.emitter.on(event, handler);
      return () => this.emitter.off(event, handler);
    });
  }

  once<K extends keyof AppEvents>(event: K): Effect.Effect<AppEvents[K]> {
    return Effect.async((resume) => {
      this.emitter.once(event, (data) => {
        resume(Effect.succeed(data));
      });
    });
  }
}
```

## Padrões de Uso

### 1. Repository Pattern

```typescript
interface Repository<T> {
  findById(id: string): Effect.Effect<T, NotFoundError>;
  findAll(): Effect.Effect<T[]>;
  save(entity: T): Effect.Effect<void>;
  delete(id: string): Effect.Effect<void>;
}

class SessionRepository implements Repository<Session> {
  findById(id: string) {
    return Effect.gen(function* () {
      const store = yield* StoreService;
      const session = yield* store.get<Session>(`session:${id}`);
      return session;
    });
  }

  // ... outros métodos
}
```

### 2. Unit of Work

```typescript
class UnitOfWork {
  private changes: Effect.Effect<void>[] = [];

  add(effect: Effect.Effect<void>): void {
    this.changes.push(effect);
  }

  commit(): Effect.Effect<void> {
    return Effect.all(this.changes).pipe(Effect.map(() => undefined));
  }

  rollback(): Effect.Effect<void> {
    this.changes = [];
    return Effect.void;
  }
}
```

### 3. Saga Pattern

```typescript
const createSessionSaga = (input: CreateSessionInput) =>
  Effect.gen(function* () {
    const uow = new UnitOfWork();

    // Step 1: Cria sessão
    const session = yield* createSession(input);
    uow.add(saveSession(session));

    // Step 2: Indexa codebase
    const index = yield* indexCodebase(input.worktree);
    uow.add(saveIndex(session.id, index));

    // Step 3: Notifica
    uow.add(notifyUser("Session created"));

    // Commit ou rollback
    try {
      yield* uow.commit();
      return session;
    } catch (error) {
      yield* uow.rollback();
      yield* Effect.fail(new SagaError(error));
    }
  });
```

### 4. CQRS (Command Query Responsibility Segregation)

```typescript
// Commands (escrita)
const CreateSessionCommand = (input: CreateSessionInput) =>
  Effect.gen(function* () {
    const repo = yield* SessionRepository;
    const session = Session.create(input);
    yield* repo.save(session);
    yield* EventBus.emit("session:created", { id: session.id });
    return session;
  });

// Queries (leitura)
const GetSessionQuery = (id: string) =>
  Effect.gen(function* () {
    const repo = yield* SessionRepository;
    const session = yield* repo.findById(id);
    return session;
  });
```

## Integração com React/Ink

```typescript
import { useEffect, useState } from 'react';
import { Effect } from 'effect';

// Hook para executar Effects
function useEffectRun<R, E>(
  effect: Effect.Effect<R, E>,
  deps: any[] = []
): { data: R | null; error: E | null; loading: boolean } {
  const [state, setState] = useState({
    data: null as R | null,
    error: null as E | null,
    loading: true,
  });

  useEffect(() => {
    Effect.runPromise(effect)
      .then(data => setState({ data, error: null, loading: false }))
      .catch(error => setState({ data: null, error, loading: false }));
  }, deps);

  return state;
}

// Uso em componente
const SessionList = () => {
  const { data: sessions, loading } = useEffectRun(
    SessionService.list()
  );

  if (loading) return <Spinner />;

  return (
    <Box>
      {sessions?.map(s => (
        <SessionItem key={s.id} session={s} />
      ))}
    </Box>
  );
};
```

## Testes com Effect

```typescript
import { Effect } from "effect";
import { describe, it, expect } from "vitest";

describe("SessionService", () => {
  it("should create session", async () => {
    const program = Effect.gen(function* () {
      const service = yield* SessionService;
      const id = yield* service.create("/test");
      const session = yield* service.get(id);
      return session.worktree;
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(SessionServiceLive)));

    expect(result).toBe("/test");
  });

  it("should handle errors", async () => {
    const program = Effect.gen(function* () {
      const service = yield* SessionService;
      yield* service.get("non-existent");
    });

    const result = await Effect.runPromiseExit(program.pipe(Effect.provide(SessionServiceLive)));

    expect(Exit.isFailure(result)).toBe(true);
  });
});
```

---

**Anterior**: [11 - Estratégia de Busca](./11-search-strategy.md)  
**Próximo**: [13 - Estratégia de Testes](./13-testing-strategy.md)
