import { Effect } from "effect";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { defineTool, type ToolRegistry } from "./tool.js";

export function createToolSearchTool(registry: ToolRegistry) {
  return defineTool({
    name: "tool_search",
    description:
      "Search and activate deferred tools (MCP integrations) by name or description keyword. "
      + "Call this before using a tool that is not in the current schema. "
      + "Matched tools are revealed and available in subsequent calls this session.",
    parameters: z.object({
      query: z.string().min(1).describe("Keyword to search in tool names and descriptions"),
    }),
    execute: (args, context) =>
      Effect.tryPromise({
        try: async () => {
          const query = args.query.toLowerCase();
          const deferred = registry.listDeferred();

          if (deferred.length === 0) {
            return "No deferred tools are configured. Add MCP servers in .deepcode/config.json to enable integrations.";
          }

          const matches = deferred.filter(
            (t) =>
              t.name.toLowerCase().includes(query)
              || t.description.toLowerCase().includes(query),
          );

          if (matches.length === 0) {
            const available = deferred
              .map((t) => `- ${t.name}: ${t.description.slice(0, 100)}`)
              .join("\n");
            return `No deferred tools match "${args.query}".\n\nAll available deferred tools:\n${available}`;
          }

          context.revealTools?.(matches.map((t) => t.name));

          const schemas = matches.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: zodToJsonSchema(t.parameters, { target: "jsonSchema7" }),
          }));

          return [
            `Revealed ${matches.length} tool(s) — available for calls in this session:`,
            JSON.stringify(schemas, null, 2),
          ].join("\n\n");
        },
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }),
  });
}
