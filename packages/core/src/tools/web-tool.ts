import { Effect } from "effect";
import { z } from "zod";
import type { Activity } from "@terminuz/shared";
import type { ToolContext } from "./tool.js";
import { defineTool } from "./tool.js";

export const fetchWebTool = defineTool({
  name: "fetch_web",
  description: `Fetch content from a URL. Useful for reading documentation, API references, or web resources.
Returns the content as text. Supports HTTP and HTTPS URLs.
Use this to look up documentation, library APIs, or other web resources relevant to the task.
Note: This tool requires explicit approval and may be restricted by web.allowlist/web.blacklist configuration.`,
  parameters: z.object({
    url: z.string().url().describe("URL to fetch (must start with http:// or https://)"),
    maxLength: z
      .number()
      .int()
      .positive()
      .max(50000)
      .optional()
      .describe("Maximum content length to return (default: 10000)"),
  }),
  execute: (args, context: ToolContext): Effect.Effect<string, Error> =>
    Effect.tryPromise({
      try: async () => {
        const url = args.url;
        const maxLength = args.maxLength ?? 10000;

        // Validate permissions before fetching
        await context.permissions.ensure({
          operation: `fetch_web: ${url}`,
          kind: "dangerous",
          details: { url, maxLength },
        });

        const allowedUrls: string[] = context.config.web.allowlist;
        const blockedUrls: string[] = context.config.web.blacklist;

        const isAllowed =
          allowedUrls.length === 0 ||
          allowedUrls.some((pattern) => matchesWebPattern(url, pattern));
        if (!isAllowed) {
          throw new Error(`URL ${url} is not permitted by web.allowlist`);
        }

        const isBlocked = blockedUrls.some((pattern) => matchesWebPattern(url, pattern));
        if (isBlocked) {
          throw new Error(`URL ${url} is blocked by web.blacklist`);
        }

        const activity: Omit<Activity, "id" | "createdAt"> = {
          type: "web_fetch",
          message: `Fetching ${url}`,
          metadata: { url, maxLength },
        };
        context.logActivity(activity);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
          let response: Response;
          try {
            response = await fetch(url, {
              signal: controller.signal,
              headers: {
                "User-Agent": "Terminuz/1.0 (AI coding agent)",
                Accept: "text/html, text/plain, application/json, */*",
              },
            });
          } catch (error) {
            throw new Error(
              `Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText} from ${url}`);
          }

          const contentType = response.headers.get("content-type") || "";
          let text: string;
          try {
            text = await response.text();
          } catch (error) {
            throw new Error(
              `Failed to read response from ${url}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          if (text.length > maxLength) {
            text =
              text.slice(0, maxLength) + "\n\n[Content truncated. Use maxLength to fetch more.]";
          }

          if (contentType.includes("text/html")) {
            text = extractTextFromHtml(text);
          }

          return `Fetched ${url} (${contentType})\n\n${text}`;
        } finally {
          clearTimeout(timeout);
        }
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))),
    }),
});

function matchesWebPattern(url: string, pattern: string): boolean {
  if (pattern.startsWith("regex:")) {
    const regex = new RegExp(pattern.slice("regex:".length));
    return regex.test(url);
  }

  const candidateUrl = new URL(url);
  const normalizedPattern = normalizeWebPattern(pattern);
  const candidate = selectWebCandidate(candidateUrl, normalizedPattern);
  const regex = wildcardPatternToRegex(normalizedPattern);
  return regex.test(candidate);
}

function normalizeWebPattern(pattern: string): string {
  return pattern.trim().replace(/\\([./:*?#[\]-])/g, "$1");
}

function selectWebCandidate(url: URL, pattern: string): string {
  if (pattern.includes("://")) {
    const pathIndex = pattern.indexOf("/", pattern.indexOf("://") + 3);
    return pathIndex === -1 ? url.origin : `${url.origin}${url.pathname}`;
  }
  if (pattern.startsWith("/")) {
    return url.pathname;
  }
  if (pattern.includes("/")) {
    return `${url.host}${url.pathname}`;
  }
  return url.host;
}

function wildcardPatternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

function extractTextFromHtml(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, " ");
  return text.trim();
}
