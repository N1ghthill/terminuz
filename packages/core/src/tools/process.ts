import { execFile, spawn } from "node:child_process";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  outputExceeded?: boolean;
  outputLimitBytes?: number;
}

const DEFAULT_SHELL_OUTPUT_LIMIT_BYTES = 512 * 1024;

export function execFileAsync(
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        signal: options.signal,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: "1" },
      },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException & { code?: number | null };
          if (typeof err.code === "number") {
            resolve({ stdout, stderr, exitCode: err.code });
            return;
          }
          reject(error);
          return;
        }
        resolve({ stdout, stderr, exitCode: 0 });
      },
    );
  });
}

export function runShell(
  command: string,
  options: { cwd: string; timeoutMs: number; signal?: AbortSignal; maxOutputBytes?: number },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "1" },
      signal: options.signal,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputExceeded = false;
    let outputBytes = 0;
    const outputLimitBytes = options.maxOutputBytes ?? DEFAULT_SHELL_OUTPUT_LIMIT_BYTES;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1500).unref();
    }, options.timeoutMs);

    const appendOutput = (target: "stdout" | "stderr", chunk: Buffer | string) => {
      if (outputExceeded) return;
      const text = String(chunk);
      outputBytes += Buffer.byteLength(text);
      if (outputBytes > outputLimitBytes) {
        outputExceeded = true;
        const remainingBytes = Math.max(0, outputLimitBytes - (outputBytes - Buffer.byteLength(text)));
        const kept = Buffer.from(text).subarray(0, remainingBytes).toString();
        if (target === "stdout") {
          stdout += kept;
        } else {
          stderr += kept;
        }
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 1500).unref();
        return;
      }
      if (target === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }
    };

    child.stdout?.on("data", (chunk) => {
      appendOutput("stdout", chunk);
    });
    child.stderr?.on("data", (chunk) => {
      appendOutput("stderr", chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut, outputExceeded, outputLimitBytes });
    });
  });
}
