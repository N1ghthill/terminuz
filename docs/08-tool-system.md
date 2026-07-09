# 08 - Sistema de Ferramentas

## Visão Geral

Terminuz possui um sistema de ferramentas extensível e type-safe, permitindo ao agente interagir com o ambiente de forma controlada.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                      Tool Registry                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │  read_file  │ │  write_file │ │    bash     │ │    git     │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │    grep     │ │ search_files│ │analyze_code │ │    test    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Interface                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  name: string                                           │   │
│  │  description: string                                    │   │
│  │  parameters: ZodSchema                                  │   │
│  │  execute(args, context): Effect<Result>                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Interface Base

```typescript
import { z } from "zod";
import { Effect } from "effect";

// Contexto passado para todas as ferramentas
interface ToolContext {
  sessionId: string;
  messageId: string;
  worktree: string;
  directory: string;
  abortSignal: AbortSignal;

  // Utilidades
  requestPermission(operation: string): Promise<boolean>;
  logActivity(activity: Activity): void;
  emitEvent(event: ToolEvent): void;
}

// Resultado da execução
type ToolResult =
  | string
  | {
      output: string;
      metadata?: Record<string, any>;
    };

// Definição de ferramenta
interface ToolDefinition<TParams extends z.ZodRawShape, TResult> {
  name: string;
  description: string;
  parameters: z.ZodObject<TParams>;
  execute(args: z.infer<z.ZodObject<TParams>>, context: ToolContext): Effect.Effect<TResult>;
}

// Helper para criar ferramentas
function tool<TParams extends z.ZodRawShape, TResult>(
  definition: ToolDefinition<TParams, TResult>,
) {
  return definition;
}
```

## Ferramentas de Arquivo

### read_file

```typescript
const readFileTool = tool({
  name: "read_file",
  description: `Read the contents of a file from the local filesystem.
    The output will include line numbers.
    Useful for understanding file contents before making changes.`,
  parameters: z.object({
    path: z.string().describe("Absolute path to the file"),
    offset: z.number().optional().describe("Line number to start from"),
    limit: z.number().optional().describe("Number of lines to read"),
  }),
  execute: (args, context) =>
    Effect.gen(function* () {
      // 1. Valida path
      const validatedPath = yield* validatePath(args.path, context);

      // 2. Verifica permissão
      const allowed = yield* Effect.promise(() =>
        context.requestPermission(`read ${validatedPath}`),
      );

      if (!allowed) {
        return yield* Effect.fail(new PermissionDeniedError());
      }

      // 3. Lê arquivo
      const content = yield* Effect.tryPromise(() => fs.readFile(validatedPath, "utf-8"));

      // 4. Aplica offset/limit
      const lines = content.split("\n");
      const start = args.offset || 0;
      const end = args.limit ? start + args.limit : lines.length;
      const selectedLines = lines.slice(start, end);

      // 5. Formata com números de linha
      const formatted = selectedLines.map((line, i) => `${start + i + 1}: ${line}`).join("\n");

      // 6. Log
      context.logActivity({
        type: "file_read",
        path: validatedPath,
        lines: selectedLines.length,
      });

      return formatted;
    }),
});
```

### write_file

```typescript
const writeFileTool = tool({
  name: "write_file",
  description: `Create or overwrite a file with the given content.
    Will create parent directories if they don't exist.`,
  parameters: z.object({
    path: z.string().describe("Absolute path to the file"),
    content: z.string().describe("Content to write"),
  }),
  execute: (args, context) =>
    Effect.gen(function* () {
      const validatedPath = yield* validatePath(args.path, context);

      const allowed = yield* Effect.promise(() =>
        context.requestPermission(`write ${validatedPath}`),
      );

      if (!allowed) {
        return yield* Effect.fail(new PermissionDeniedError());
      }

      // Cria diretórios se necessário
      const dir = path.dirname(validatedPath);
      yield* Effect.tryPromise(() => fs.mkdir(dir, { recursive: true }));

      // Escreve arquivo
      yield* Effect.tryPromise(() => fs.writeFile(validatedPath, args.content, "utf-8"));

      context.logActivity({
        type: "file_written",
        path: validatedPath,
        size: args.content.length,
      });

      return `File written successfully: ${validatedPath}`;
    }),
});
```

### edit_file

```typescript
const editFileTool = tool({
  name: "edit_file",
  description: `Edit a file by replacing specific text.
    The old_string must match exactly (including whitespace).`,
  parameters: z.object({
    path: z.string().describe("Absolute path to the file"),
    oldString: z.string().describe("Text to replace"),
    newString: z.string().describe("Replacement text"),
  }),
  execute: (args, context) =>
    Effect.gen(function* () {
      const validatedPath = yield* validatePath(args.path, context);

      const allowed = yield* Effect.promise(() =>
        context.requestPermission(`edit ${validatedPath}`),
      );

      if (!allowed) {
        return yield* Effect.fail(new PermissionDeniedError());
      }

      // Lê conteúdo atual
      const content = yield* Effect.tryPromise(() => fs.readFile(validatedPath, "utf-8"));

      // Verifica se oldString existe
      if (!content.includes(args.oldString)) {
        return yield* Effect.fail(
          new Error(`oldString not found in file: ${args.oldString.substring(0, 50)}...`),
        );
      }

      // Verifica se há múltiplas ocorrências
      const occurrences = content.split(args.oldString).length - 1;
      if (occurrences > 1) {
        return yield* Effect.fail(
          new Error(`Multiple occurrences (${occurrences}) found. Be more specific.`),
        );
      }

      // Substitui
      const newContent = content.replace(args.oldString, args.newString);

      // Escreve
      yield* Effect.tryPromise(() => fs.writeFile(validatedPath, newContent, "utf-8"));

      context.logActivity({
        type: "file_edited",
        path: validatedPath,
        diff: generateDiff(args.oldString, args.newString),
      });

      return `File edited successfully: ${validatedPath}`;
    }),
});
```

### list_dir

```typescript
const listDirTool = tool({
  name: "list_dir",
  description: "List contents of a directory",
  parameters: z.object({
    path: z.string().describe("Absolute path to directory"),
  }),
  execute: (args, context) =>
    Effect.gen(function* () {
      const validatedPath = yield* validatePath(args.path, context);

      const entries = yield* Effect.tryPromise(() =>
        fs.readdir(validatedPath, { withFileTypes: true }),
      );

      const formatted = entries.map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`).join("\n");

      return formatted;
    }),
});
```

## Ferramentas de Busca

### search_text (ripgrep)

```typescript
const searchTextTool = tool({
  name: "search_text",
  description: "Search for text patterns in files using ripgrep",
  parameters: z.object({
    pattern: z.string().describe("Regex pattern to search"),
    path: z.string().optional().describe("Directory to search in"),
    include: z.string().optional().describe("File glob pattern"),
  }),
  execute: (args, context) =>
    Effect.gen(function* () {
      const searchPath = args.path || context.worktree;
      const validatedPath = yield* validatePath(searchPath, context);

      // Monta comando ripgrep
      const cmd = ["rg", "--json", "--context", "2", args.pattern];

      if (args.include) {
        cmd.push("--glob", args.include);
      }

      cmd.push(validatedPath);

      // Executa
      const result = yield* Effect.tryPromise(() =>
        execAsync(cmd.join(" "), { cwd: validatedPath }),
      );

      // Parse resultado JSON
      const lines = result.stdout.split("\n");
      const matches = lines
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
        .filter((l) => l.type === "match");

      // Formata
      const formatted = matches.map((m) => ({
        file: m.data.path.text,
        line: m.data.line_number,
        text: m.data.lines.text,
      }));

      return JSON.stringify(formatted, null, 2);
    }),
});
```

### search_files

```typescript
const searchFilesTool = tool({
  name: "search_files",
  description: "Find files by name pattern",
  parameters: z.object({
    query: z.string().describe("Search query"),
    type: z.enum(["file", "directory"]).optional(),
  }),
  execute: (args, context) =>
    Effect.gen(function* () {
      const pattern = `**/*${args.query}*`;

      const files = yield* Effect.tryPromise(() =>
        glob(pattern, {
          cwd: context.worktree,
          nodir: args.type === "file",
        }),
      );

      return files.join("\n");
    }),
});
```

## Ferramentas de Shell

### bash

```typescript
const bashTool = tool({
  name: "bash",
  description: `Execute shell commands.
    Use with caution. Commands are executed in the project directory.`,
  parameters: z.object({
    command: z.string().describe("Command to execute"),
    cwd: z.string().optional().describe("Working directory"),
    timeout: z.number().optional().describe("Timeout in seconds"),
  }),
  execute: (args, context) =>
    Effect.gen(function* () {
      // Sempre requer permissão para shell
      const allowed = yield* Effect.promise(() =>
        context.requestPermission(`bash: ${args.command}`),
      );

      if (!allowed) {
        return yield* Effect.fail(new PermissionDeniedError());
      }

      const cwd = args.cwd || context.worktree;
      const timeout = (args.timeout || 30) * 1000;

      // Executa com timeout
      const result = yield* Effect.tryPromise({
        try: () =>
          execAsync(args.command, {
            cwd,
            timeout,
            env: { ...process.env, FORCE_COLOR: "1" },
          }),
        catch: (error) => new BashError(error.message),
      });

      const output = [result.stdout, result.stderr && `stderr: ${result.stderr}`]
        .filter(Boolean)
        .join("\n");

      context.logActivity({
        type: "bash",
        command: args.command,
        exitCode: 0,
      });

      return output || "Command executed successfully (no output)";
    }),
});
```

## Ferramentas Git

### git

```typescript
const gitTool = tool({
  name: "git",
  description: "Execute git operations",
  parameters: z.object({
    operation: z.enum([
      "status",
      "diff",
      "add",
      "commit",
      "push",
      "pull",
      "branch",
      "checkout",
      "log",
      "clone",
    ]),
    args: z.record(z.any()).optional(),
  }),
  execute: (args, context) =>
    Effect.gen(function* () {
      const git = simpleGit(context.worktree);

      switch (args.operation) {
        case "status":
          return yield* Effect.tryPromise(() => git.status());

        case "commit":
          // Sempre requer permissão
          const allowed = yield* Effect.promise(() =>
            context.requestPermission(`git commit: ${args.args?.message}`),
          );
          if (!allowed) return yield* Effect.fail(new PermissionDeniedError());

          return yield* Effect.tryPromise(() => git.commit(args.args!.message, args.args?.files));

        case "push":
          const pushAllowed = yield* Effect.promise(() =>
            context.requestPermission(`git push to ${args.args?.remote}`),
          );
          if (!pushAllowed) return yield* Effect.fail(new PermissionDeniedError());

          return yield* Effect.tryPromise(() => git.push(args.args?.remote, args.args?.branch));

        // ... outras operações
      }
    }),
});
```

## Tool Registry

```typescript
class ToolRegistry {
  private tools: Map<string, ToolDefinition<any, any>> = new Map();

  register(tool: ToolDefinition<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition<any, any>[] {
    return Array.from(this.tools.values());
  }

  getToolDescriptions(): string {
    return this.list()
      .map((t) => `- ${t.name}: ${t.description}`)
      .join("\n");
  }
}

// Inicialização
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // File operations
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(listDirTool);

  // Search
  registry.register(searchTextTool);
  registry.register(searchFilesTool);

  // Shell
  registry.register(bashTool);

  // Git
  registry.register(gitTool);

  return registry;
}
```

## Uso no Agente

```typescript
// O LLM recebe as tool definitions
const tools = registry.list().map((t) => ({
  name: t.name,
  description: t.description,
  parameters: zodToJsonSchema(t.parameters),
}));

// Quando LLM chama uma tool
async function handleToolCall(call: ToolCall, context: ToolContext): Promise<string> {
  const tool = registry.get(call.name);

  if (!tool) {
    throw new Error(`Tool not found: ${call.name}`);
  }

  // Valida argumentos
  const args = tool.parameters.parse(call.arguments);

  // Executa
  const result = await Effect.runPromise(tool.execute(args, context));

  return typeof result === "string" ? result : result.output;
}
```

---

**Anterior**: [07 - Abstração de Providers](./07-provider-abstraction.md)  
**Próximo**: [09 - Loop do Agente](./09-agent-loop.md)
