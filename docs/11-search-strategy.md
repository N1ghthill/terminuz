# 11 - Estratégia de Busca

## Visão Geral

Terminuz utiliza uma estratégia de busca **híbrida**, combinando busca textual rápida (ripgrep) com busca semântica via LSP (Language Server Protocol). **Não usa vector embeddings** seguindo o padrão do OpenCode.

## Por que não Vector DB?

Após análise do OpenCode, constatou-se que:

- **ripgrep** é mais rápido para busca textual
- **LSP** fornece busca semântica precisa
- **Sem overhead** de embeddings e indexação
- **Funciona offline**
- **Menor uso de memória**

## Arquitetura de Busca

```
┌─────────────────────────────────────────────────────────────────┐
│                    Search Engine                                 │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │   Text Search       │  │  Symbolic Search    │               │
│  │   (ripgrep)         │  │  (LSP)              │               │
│  │                     │  │                     │               │
│  │  • Exact match      │  │  • Definitions      │               │
│  │  • Regex            │  │  • References       │               │
│  │  • Fast (indexed)   │  │  • Type info        │               │
│  └─────────────────────┘  └─────────────────────┘               │
│           │                        │                            │
│           └────────┬───────────────┘                            │
│                    ▼                                             │
│           ┌─────────────────┐                                   │
│           │  Merge Results  │                                   │
│           │  + Ranking      │                                   │
│           └─────────────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 1. Text Search (ripgrep)

### Implementação

```typescript
class TextSearchEngine {
  async search(options: TextSearchOptions): Promise<TextSearchResult[]> {
    const cmd = this.buildRipgrepCommand(options);

    const { stdout } = await execAsync(cmd, {
      cwd: options.path,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    return this.parseResults(stdout);
  }

  private buildRipgrepCommand(options: TextSearchOptions): string {
    const args = ["rg", "--json"];

    // Context lines
    if (options.context) {
      args.push("--context", options.context.toString());
    }

    // Case sensitivity
    if (options.caseSensitive === false) {
      args.push("--ignore-case");
    }

    // File types
    if (options.fileType) {
      args.push("--type", options.fileType);
    }

    // Include/exclude patterns
    if (options.include) {
      args.push("--glob", options.include);
    }

    if (options.exclude) {
      args.push("--glob", `!${options.exclude}`);
    }

    // Pattern and path
    args.push(options.pattern);
    args.push(options.path);

    return args.join(" ");
  }

  private parseResults(stdout: string): TextSearchResult[] {
    const lines = stdout.split("\n").filter(Boolean);
    const results: TextSearchResult[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);

        if (parsed.type === "match") {
          results.push({
            file: parsed.data.path.text,
            line: parsed.data.line_number,
            column: parsed.data.submatches[0]?.start || 0,
            text: parsed.data.lines.text,
            matches: parsed.data.submatches.map((m: any) => ({
              text: m.match.text,
              start: m.start,
              end: m.end,
            })),
          });
        }
      } catch {
        // Ignore parse errors
      }
    }

    return results;
  }
}
```

### Uso

```typescript
const searchEngine = new TextSearchEngine();

// Busca simples
const results = await searchEngine.search({
  pattern: "function authenticate",
  path: "/home/user/project",
});

// Busca com contexto
const resultsWithContext = await searchEngine.search({
  pattern: "jwt\.verify",
  path: "/home/user/project",
  context: 3, // 3 linhas antes e depois
  fileType: "ts",
});

// Busca case-insensitive
const caseInsensitiveResults = await searchEngine.search({
  pattern: "user",
  path: "/home/user/project",
  caseSensitive: false,
});
```

## 2. Symbolic Search (LSP)

### LSP Client

```typescript
class LSPClient {
  private connection: rpc.MessageConnection;
  private initialized = false;

  async connect(serverPath: string, rootPath: string): Promise<void> {
    // Spawns LSP server (e.g., typescript-language-server)
    const serverProcess = spawn(serverPath, ["--stdio"]);

    // Create connection
    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(serverProcess.stdout),
      new rpc.StreamMessageWriter(serverProcess.stdin),
    );

    // Initialize
    const result = await this.connection.sendRequest("initialize", {
      processId: process.pid,
      rootUri: `file://${rootPath}`,
      capabilities: {},
    });

    this.initialized = true;
  }

  async searchSymbols(query: string): Promise<Symbol[]> {
    this.ensureInitialized();

    const result = await this.connection.sendRequest("workspace/symbol", {
      query,
    });

    return result.map((s: any) => ({
      name: s.name,
      kind: s.kind,
      location: {
        file: s.location.uri.replace("file://", ""),
        line: s.location.range.start.line,
        column: s.location.range.start.character,
      },
      container: s.containerName,
    }));
  }

  async findReferences(file: string, line: number, column: number): Promise<Location[]> {
    this.ensureInitialized();

    const result = await this.connection.sendRequest("textDocument/references", {
      textDocument: { uri: `file://${file}` },
      position: { line, character: column },
      context: { includeDeclaration: true },
    });

    return result.map((r: any) => ({
      file: r.uri.replace("file://", ""),
      line: r.range.start.line,
      column: r.range.start.character,
    }));
  }

  async getDefinition(file: string, line: number, column: number): Promise<Location[]> {
    this.ensureInitialized();

    const result = await this.connection.sendRequest("textDocument/definition", {
      textDocument: { uri: `file://${file}` },
      position: { line, character: column },
    });

    return Array.isArray(result)
      ? result.map((r) => ({
          file: r.uri.replace("file://", ""),
          line: r.range.start.line,
          column: r.range.start.character,
        }))
      : [];
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("LSP client not initialized");
    }
  }
}
```

### LSP Manager

```typescript
class LSPManager {
  private clients: Map<string, LSPClient> = new Map();

  private languageServers: Record<string, string> = {
    typescript: "typescript-language-server",
    javascript: "typescript-language-server",
    python: "pylsp",
    rust: "rust-analyzer",
    go: "gopls",
  };

  async getClientForFile(filePath: string): Promise<LSPClient | null> {
    const ext = path.extname(filePath);
    const language = this.getLanguageFromExt(ext);

    if (!language) return null;

    if (!this.clients.has(language)) {
      const serverPath = this.languageServers[language];
      if (!serverPath) return null;

      const client = new LSPClient();
      await client.connect(serverPath, this.getWorktree(filePath));

      this.clients.set(language, client);
    }

    return this.clients.get(language)!;
  }

  private getLanguageFromExt(ext: string): string | null {
    const map: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".rs": "rust",
      ".go": "go",
    };

    return map[ext] || null;
  }
}
```

## 3. Codebase Index

### Índice Simbólico

```typescript
interface CodebaseIndex {
  files: Map<string, FileInfo>;
  symbols: Map<string, SymbolInfo[]>;
  lastUpdate: Date;
}

interface FileInfo {
  path: string;
  language: string;
  size: number;
  lastModified: Date;
  imports: string[];
  exports: string[];
}

interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "variable" | "interface" | "type";
  file: string;
  line: number;
  column: number;
  signature?: string;
  documentation?: string;
}

class CodebaseIndexer {
  private index: CodebaseIndex = {
    files: new Map(),
    symbols: new Map(),
    lastUpdate: new Date(0),
  };

  async index(worktree: string): Promise<void> {
    console.log("🔍 Indexando codebase...");

    // 1. Encontra todos os arquivos
    const files = await glob("**/*.{ts,tsx,js,jsx,py,rs,go}", {
      cwd: worktree,
      ignore: ["node_modules/**", ".git/**", "dist/**"],
    });

    // 2. Indexa cada arquivo
    for (const file of files) {
      await this.indexFile(path.join(worktree, file));
    }

    this.index.lastUpdate = new Date();
    console.log(`✅ Indexação completa: ${files.length} arquivos`);
  }

  private async indexFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, "utf-8");
    const stats = await fs.stat(filePath);
    const ext = path.extname(filePath);

    // Extrai informações básicas
    const fileInfo: FileInfo = {
      path: filePath,
      language: this.getLanguageFromExt(ext),
      size: stats.size,
      lastModified: stats.mtime,
      imports: this.extractImports(content, ext),
      exports: this.extractExports(content, ext),
    };

    this.index.files.set(filePath, fileInfo);

    // Extrai símbolos (simplificado - idealmente via LSP)
    const symbols = this.extractSymbols(content, filePath, ext);
    for (const symbol of symbols) {
      if (!this.index.symbols.has(symbol.name)) {
        this.index.symbols.set(symbol.name, []);
      }
      this.index.symbols.get(symbol.name)!.push(symbol);
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // 1. Busca em símbolos
    for (const [name, symbols] of this.index.symbols) {
      if (name.toLowerCase().includes(query.toLowerCase())) {
        results.push(
          ...symbols.map((s) => ({
            type: "symbol",
            name: s.name,
            file: s.file,
            line: s.line,
            kind: s.kind,
          })),
        );
      }
    }

    // 2. Busca em arquivos
    for (const [filePath, info] of this.index.files) {
      if (path.basename(filePath).toLowerCase().includes(query.toLowerCase())) {
        results.push({
          type: "file",
          name: path.basename(filePath),
          file: filePath,
          language: info.language,
        });
      }
    }

    return this.rankResults(results, query);
  }

  private rankResults(results: SearchResult[], query: string): SearchResult[] {
    // Ordena por relevância
    return results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === query.toLowerCase();
      const bExact = b.name.toLowerCase() === query.toLowerCase();

      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      return a.name.localeCompare(b.name);
    });
  }
}
```

## 4. Ferramentas de Busca

```typescript
const searchTools = {
  // Busca textual
  search_text: tool({
    name: "search_text",
    description: "Search for text patterns using ripgrep",
    parameters: z.object({
      pattern: z.string(),
      path: z.string().optional(),
      context: z.number().optional(),
      fileType: z.string().optional(),
    }),
    execute: async (args, ctx) => {
      const engine = new TextSearchEngine();
      return await engine.search({
        pattern: args.pattern,
        path: args.path || ctx.worktree,
        context: args.context,
        fileType: args.fileType,
      });
    },
  }),

  // Busca de arquivos
  search_files: tool({
    name: "search_files",
    description: "Find files by name pattern",
    parameters: z.object({
      query: z.string(),
    }),
    execute: async (args, ctx) => {
      const files = await glob(`**/*${args.query}*`, {
        cwd: ctx.worktree,
      });
      return files;
    },
  }),

  // Busca simbólica (via LSP)
  search_symbols: tool({
    name: "search_symbols",
    description: "Search for symbols (functions, classes, etc.)",
    parameters: z.object({
      query: z.string(),
      file: z.string().optional(),
    }),
    execute: async (args, ctx) => {
      const lspManager = new LSPManager();
      const client = args.file ? await lspManager.getClientForFile(args.file) : null;

      if (!client) {
        // Fallback para índice local
        const indexer = new CodebaseIndexer();
        return await indexer.search(args.query);
      }

      return await client.searchSymbols(args.query);
    },
  }),

  // Encontrar referências
  find_references: tool({
    name: "find_references",
    description: "Find all references to a symbol",
    parameters: z.object({
      file: z.string(),
      line: z.number(),
      column: z.number(),
    }),
    execute: async (args, ctx) => {
      const lspManager = new LSPManager();
      const client = await lspManager.getClientForFile(args.file);

      if (!client) {
        throw new Error("No LSP client available for this file type");
      }

      return await client.findReferences(args.file, args.line, args.column);
    },
  }),

  // Ir para definição
  goto_definition: tool({
    name: "goto_definition",
    description: "Go to the definition of a symbol",
    parameters: z.object({
      file: z.string(),
      line: z.number(),
      column: z.number(),
    }),
    execute: async (args, ctx) => {
      const lspManager = new LSPManager();
      const client = await lspManager.getClientForFile(args.file);

      if (!client) {
        throw new Error("No LSP client available for this file type");
      }

      return await client.getDefinition(args.file, args.line, args.column);
    },
  }),
};
```

## 5. Cache e Performance

```typescript
class SearchCache {
  private cache: Map<string, { result: any; expiry: number }> = new Map();
  private ttl: number = 5 * 60 * 1000; // 5 minutos

  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  set(key: string, result: any): void {
    this.cache.set(key, {
      result,
      expiry: Date.now() + this.ttl,
    });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}
```

---

**Anterior**: [10 - Integração GitHub](./10-github-integration.md)  
**Próximo**: [12 - Gerenciamento de Estado](./12-state-management.md)
