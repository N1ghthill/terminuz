export interface UseStatusLineReturn {
  lines: string[];
}

// AppHeader row 2 shows cwd + git branch — no need to duplicate in the Footer.
export function useStatusLine(): UseStatusLineReturn {
  return { lines: [] };
}
