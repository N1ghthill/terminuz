import { writeSync } from "node:fs";

function getStreamFd(stream: NodeJS.WriteStream): number | undefined {
  const candidate = stream as NodeJS.WriteStream & { fd?: number };
  return typeof candidate.fd === "number" ? candidate.fd : undefined;
}

function writeStreamSync(stream: NodeJS.WriteStream, text: string): void {
  const fd = getStreamFd(stream);
  if (stream.destroyed || !stream.writable || stream.writableEnded || fd === undefined) {
    return;
  }

  writeSync(fd, text);
}

async function flushWritableStream(stream: NodeJS.WriteStream): Promise<void> {
  if (stream.destroyed || !stream.writable || stream.writableEnded) {
    return;
  }

  await new Promise<void>((resolve) => {
    stream.write("", () => resolve());
  });
}

async function writeToStream(stream: NodeJS.WriteStream, text: string): Promise<void> {
  if (stream.destroyed || !stream.writable || stream.writableEnded) {
    return;
  }

  if (getStreamFd(stream) !== undefined) {
    writeStreamSync(stream, text);
    return;
  }

  await new Promise<void>((resolve) => {
    stream.write(text, () => resolve());
  });
}

export async function flushStandardStreams(): Promise<void> {
  await Promise.all([flushWritableStream(process.stdout), flushWritableStream(process.stderr)]);
}

export async function writeStdout(text: string): Promise<void> {
  await writeToStream(process.stdout, text);
}

export async function writeStdoutLine(text: string): Promise<void> {
  await writeStdout(`${text}\n`);
}

export async function writeStderrLine(text: string): Promise<void> {
  await writeToStream(process.stderr, `${text}\n`);
}

export function writeStdoutSync(text: string): void {
  writeStreamSync(process.stdout, text);
}

export function writeStderrSync(text: string): void {
  writeStreamSync(process.stderr, text);
}
