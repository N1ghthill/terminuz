export async function* parseSse(response: Response): AsyncIterable<any> {
  if (!response.body) {
    return;
  }
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separator = findSseFrameSeparator(buffer);
    while (separator) {
      const { index: separatorIndex, length: separatorLength } = separator;
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + separatorLength);
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");

      const parsed = parseSseData(data);
      if (parsed !== undefined) {
        yield parsed;
      }
      separator = findSseFrameSeparator(buffer);
    }
  }

  const data = buffer
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  const parsed = parseSseData(data);
  if (parsed !== undefined) {
    yield parsed;
  }
}

function findSseFrameSeparator(buffer: string): { index: number; length: number } | undefined {
  const lfIndex = buffer.indexOf("\n\n");
  const crlfIndex = buffer.indexOf("\r\n\r\n");

  if (lfIndex === -1) {
    return crlfIndex === -1 ? undefined : { index: crlfIndex, length: 4 };
  }

  if (crlfIndex === -1 || lfIndex < crlfIndex) {
    return { index: lfIndex, length: 2 };
  }

  return { index: crlfIndex, length: 4 };
}

function parseSseData(data: string): unknown | undefined {
  if (!data || data === "[DONE]") {
    return undefined;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
