import path from "node:path";
import { Effect } from "effect";
import { z } from "zod";
import { ToolExecutionError } from "../errors.js";
import { LspClient, pickLanguageServer, type WorkspaceSymbol } from "../lsp/lsp-client.js";
import { readJsonLines } from "../utils/json.js";
import { execFileAsync } from "./process.js";
import { defineTool } from "./tool.js";

export const searchTextTool = defineTool({
  name: "search_text",
  description: "Search text or regex patterns using ripgrep. Returns JSON match rows.",
  parameters: z.object({
    pattern: z.string().min(1),
    path: z.string().default("."),
    include: z.string().optional(),
    context: z.number().int().min(0).max(10).default(2),
    caseSensitive: z.boolean().default(true),
  }),
  execute: (args, context) =>
    Effect.tryPromise({
      try: async () => {
        const searchPath = await context.pathSecurity.normalize(args.path, {
          enforceAccess: false,
        });
        await context.permissions.ensure({
          operation: "search_text",
          kind: "read",
          path: searchPath,
        });
        const rgArgs = ["--json", "--context", String(args.context)];
        if (!args.caseSensitive) rgArgs.push("--ignore-case");
        if (args.include) rgArgs.push("--glob", args.include);
        rgArgs.push(args.pattern, searchPath);
        const cacheParts = [
          searchPath,
          args.pattern,
          args.include ?? null,
          args.context,
          args.caseSensitive,
        ];
        const cached = await context.cache.get<string>("search_text", cacheParts);
        if (cached.hit && cached.value !== undefined) {
          context.logActivity({
            type: "cache_hit",
            message: `Cache hit search_text ${path.relative(context.worktree, searchPath) || "."}`,
            metadata: { pattern: args.pattern },
          });
          return cached.value;
        }
        const result = await execFileAsync("rg", rgArgs, {
          cwd: context.worktree,
          timeoutMs: 30_000,
          signal: context.abortSignal,
        });
        if (result.exitCode !== 0 && result.exitCode !== 1) {
          throw new Error(result.stderr || `ripgrep exited with ${result.exitCode}`);
        }
        const matches = readJsonLines(result.stdout)
          .filter((row: any) => row.type === "match")
          .map((row: any) => ({
            file: row.data.path.text,
            line: row.data.line_number,
            text: row.data.lines.text.trimEnd(),
            matches: row.data.submatches?.map((match: any) => ({
              text: match.match.text,
              start: match.start,
              end: match.end,
            })),
          }));
        context.logActivity({
          type: "text_search",
          message: `Searched ${path.relative(context.worktree, searchPath) || "."}`,
          metadata: { pattern: args.pattern, matches: matches.length },
        });
        const output = JSON.stringify(matches, null, 2);
        await context.cache.set("search_text", cacheParts, output);
        return output;
      },
      catch: (error) => new ToolExecutionError("Failed to search text", error),
    }),
});

export const searchFilesTool = defineTool({
  name: "search_files",
  description: "Find files by name using ripgrep file listing.",
  parameters: z.object({
    query: z.string().min(1),
    path: z.string().default("."),
  }),
  execute: (args, context) =>
    Effect.tryPromise({
      try: async () => {
        const searchPath = await context.pathSecurity.normalize(args.path, {
          enforceAccess: false,
        });
        await context.permissions.ensure({
          operation: "search_files",
          kind: "read",
          path: searchPath,
        });
        const cacheParts = [searchPath, args.query];
        const cached = await context.cache.get<string>("search_files", cacheParts);
        if (cached.hit && cached.value !== undefined) {
          context.logActivity({
            type: "cache_hit",
            message: `Cache hit search_files ${args.query}`,
            metadata: { query: args.query },
          });
          return cached.value;
        }
        const result = await execFileAsync("rg", ["--files", searchPath], {
          cwd: context.worktree,
          timeoutMs: 30_000,
          signal: context.abortSignal,
        });
        if (result.exitCode !== 0 && result.exitCode !== 1) {
          throw new Error(result.stderr || `ripgrep exited with ${result.exitCode}`);
        }
        const needle = args.query.toLowerCase();
        const files = result.stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .filter((file) => path.basename(file).toLowerCase().includes(needle))
          .slice(0, 200);
        context.logActivity({
          type: "file_search",
          message: `Found ${files.length} file(s)`,
          metadata: { query: args.query },
        });
        const output = files.join("\n");
        await context.cache.set("search_files", cacheParts, output);
        return output;
      },
      catch: (error) => new ToolExecutionError("Failed to search files", error),
    }),
});

// ─── Heuristic symbol search (fallback when no LSP is configured) ─────────────

const HEURISTIC_RG_PATTERN =
  "(?:(?:export|pub)\\s+)?(?:async\\s+)?(?:abstract\\s+)?" +
  "(?:function|class|interface|enum|struct|trait|def|fn|type)\\s+\\w+" +
  "|(?:export\\s+)?const\\s+\\w+\\s*[=:]";

interface SymbolExtractor {
  pattern: RegExp;
  kind: number;
  nameGroup: number;
}

const SYMBOL_EXTRACTORS: SymbolExtractor[] = [
  { pattern: /\bclass\s+(\w+)/, kind: 5, nameGroup: 1 },
  { pattern: /\binterface\s+(\w+)/, kind: 11, nameGroup: 1 },
  { pattern: /\btrait\s+(\w+)/, kind: 11, nameGroup: 1 },
  { pattern: /\benum\s+(\w+)/, kind: 10, nameGroup: 1 },
  { pattern: /\bstruct\s+(\w+)/, kind: 23, nameGroup: 1 },
  { pattern: /\btype\s+(\w+)\s*[=<{(]/, kind: 26, nameGroup: 1 },
  { pattern: /\bfunction\s+(\w+)/, kind: 12, nameGroup: 1 },
  { pattern: /\basync\s+def\s+(\w+)/, kind: 12, nameGroup: 1 },
  { pattern: /\bdef\s+(\w+)/, kind: 12, nameGroup: 1 },
  { pattern: /\bfn\s+(\w+)/, kind: 12, nameGroup: 1 },
  { pattern: /\bconst\s+(\w+)\s*[=:]/, kind: 14, nameGroup: 1 },
];

function extractSymbolFromLine(line: string): { name: string; kind: number } | undefined {
  for (const extractor of SYMBOL_EXTRACTORS) {
    const m = line.match(extractor.pattern);
    if (m?.[extractor.nameGroup]) {
      return { name: m[extractor.nameGroup]!, kind: extractor.kind };
    }
  }
  return undefined;
}

export async function heuristicSymbolSearch(
  query: string,
  searchPath: string,
  worktree: string,
  signal?: AbortSignal,
): Promise<WorkspaceSymbol[]> {
  const result = await execFileAsync("rg", ["--json", HEURISTIC_RG_PATTERN, searchPath], {
    cwd: worktree,
    timeoutMs: 30_000,
    signal,
  });
  if (result.exitCode !== 0 && result.exitCode !== 1) return [];

  const needle = query.toLowerCase();
  const symbols: WorkspaceSymbol[] = [];

  for (const row of readJsonLines(result.stdout)) {
    if ((row as any).type !== "match") continue;
    const data = (row as any).data;
    const lineText: string = data.lines?.text ?? "";
    const extracted = extractSymbolFromLine(lineText);
    if (!extracted) continue;
    if (!extracted.name.toLowerCase().includes(needle)) continue;
    symbols.push({
      name: extracted.name,
      kind: extracted.kind,
      file: data.path?.text ?? "",
      line: Number(data.line_number ?? 0),
      column: 1,
    });
    if (symbols.length >= 100) break;
  }

  return symbols;
}

export const searchSymbolsTool = defineTool({
  name: "search_symbols",
  description:
    "Search workspace symbols. Uses LSP when configured; falls back to heuristic ripgrep-based extraction.",
  parameters: z.object({
    query: z.string().min(1),
    path: z.string().default("."),
  }),
  execute: (args, context) =>
    Effect.tryPromise({
      try: async () => {
        const searchPath = await context.pathSecurity.normalize(args.path, {
          enforceAccess: false,
        });
        await context.permissions.ensure({
          operation: "search_symbols",
          kind: "read",
          path: searchPath,
        });
        const server = pickLanguageServer(context.config.lsp.servers, context.worktree, searchPath);
        if (!server) {
          const cacheParts = [searchPath, args.query, "heuristic"];
          const cached = await context.cache.get<string>("search_symbols", cacheParts);
          if (cached.hit && cached.value !== undefined) {
            context.logActivity({
              type: "cache_hit",
              message: `Cache hit search_symbols ${args.query} (heuristic)`,
              metadata: { query: args.query },
            });
            return cached.value;
          }
          const symbols = await heuristicSymbolSearch(
            args.query,
            searchPath,
            context.worktree,
            context.abortSignal,
          );
          context.logActivity({
            type: "symbol_search",
            message: `Searched symbols (heuristic — no LSP configured)`,
            metadata: { query: args.query, matches: symbols.length },
          });
          const output = JSON.stringify(symbols, null, 2);
          await context.cache.set("search_symbols", cacheParts, output);
          return output;
        }
        const cacheParts = [searchPath, args.query, server.command, server.args];
        const cached = await context.cache.get<string>("search_symbols", cacheParts);
        if (cached.hit && cached.value !== undefined) {
          context.logActivity({
            type: "cache_hit",
            message: `Cache hit search_symbols ${args.query}`,
            metadata: { query: args.query },
          });
          return cached.value;
        }
        const client = new LspClient(server, context.worktree);
        await client.start();
        try {
          const symbols = (await client.searchSymbols(args.query)).slice(0, 100);
          context.logActivity({
            type: "symbol_search",
            message: `Searched symbols with ${server.command}`,
            metadata: { query: args.query, matches: symbols.length },
          });
          const output = JSON.stringify(symbols, null, 2);
          await context.cache.set("search_symbols", cacheParts, output);
          return output;
        } finally {
          await client.stop();
        }
      },
      catch: (error) => new ToolExecutionError("Failed to search symbols", error),
    }),
});
