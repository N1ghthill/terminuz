import { URLSearchParams } from "node:url";
import { execFile } from "node:child_process";
import { z } from "zod";

const DeviceCodeResponseSchema = z
  .object({
    device_code: z.string().min(1),
    user_code: z.string().min(1),
    verification_uri: z.string().url(),
    expires_in: z.number().int().positive(),
    interval: z.number().int().positive().default(5),
  })
  .passthrough();

const AccessTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().min(1),
    scope: z.string().default(""),
  })
  .passthrough();

const OAuthErrorResponseSchema = z
  .object({
    error: z.string().min(1),
    error_description: z.string().optional(),
    interval: z.number().int().positive().optional(),
  })
  .passthrough();

export interface GitHubDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface GitHubOAuthToken {
  accessToken: string;
  tokenType: string;
  scopes: string[];
}

export interface GitHubOAuthDeviceFlowOptions {
  enterpriseUrl?: string;
  openBrowser?: boolean | ((url: string) => Promise<void>);
  onBrowserOpenError?: (error: Error) => void;
  signal?: AbortSignal;
}

export interface GitHubOAuthAuthorizeOptions {
  clientId: string;
  scopes?: string[];
  onVerification?: (code: GitHubDeviceCode) => void;
  onPoll?: (status: { attempt: number; nextIntervalSeconds: number }) => void;
}

export class GitHubOAuthDeviceFlow {
  private readonly webBase: string;

  constructor(private readonly options: GitHubOAuthDeviceFlowOptions = {}) {
    this.webBase = normalizeGitHubWebBase(options.enterpriseUrl);
  }

  async authorize(options: GitHubOAuthAuthorizeOptions): Promise<GitHubOAuthToken> {
    const code = await this.requestDeviceCode({
      clientId: options.clientId,
      scopes: options.scopes ?? [],
    });
    options.onVerification?.(code);
    if (this.options.openBrowser) {
      void openVerificationUrl(code.verificationUri, this.options.openBrowser).catch((error) => {
        this.options.onBrowserOpenError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      });
    }
    return this.pollAccessToken({
      clientId: options.clientId,
      deviceCode: code.deviceCode,
      expiresIn: code.expiresIn,
      interval: code.interval,
      onPoll: options.onPoll,
    });
  }

  async requestDeviceCode(input: {
    clientId: string;
    scopes: string[];
  }): Promise<GitHubDeviceCode> {
    const body = new URLSearchParams({ client_id: input.clientId });
    if (input.scopes.length > 0) {
      body.set("scope", input.scopes.join(" "));
    }
    const data = await postForm(`${this.webBase}/login/device/code`, body, this.options.signal);
    const parsed = DeviceCodeResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Invalid GitHub device code response: ${parsed.error.message}`);
    }
    return {
      deviceCode: parsed.data.device_code,
      userCode: parsed.data.user_code,
      verificationUri: parsed.data.verification_uri,
      expiresIn: parsed.data.expires_in,
      interval: parsed.data.interval,
    };
  }

  async pollAccessToken(input: {
    clientId: string;
    deviceCode: string;
    expiresIn: number;
    interval: number;
    onPoll?: GitHubOAuthAuthorizeOptions["onPoll"];
  }): Promise<GitHubOAuthToken> {
    let interval = input.interval;
    let attempt = 0;
    const expiresAt = Date.now() + input.expiresIn * 1000;

    while (Date.now() < expiresAt) {
      if (this.options.signal?.aborted) {
        throw new Error("GitHub OAuth device flow was cancelled.");
      }
      attempt += 1;
      input.onPoll?.({ attempt, nextIntervalSeconds: interval });
      await delay(interval * 1000, this.options.signal);
      if (this.options.signal?.aborted) {
        throw new Error("GitHub OAuth device flow was cancelled.");
      }

      const body = new URLSearchParams({
        client_id: input.clientId,
        device_code: input.deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
      const data = await postForm(
        `${this.webBase}/login/oauth/access_token`,
        body,
        this.options.signal,
      );
      const token = AccessTokenResponseSchema.safeParse(data);
      if (token.success) {
        return {
          accessToken: token.data.access_token,
          tokenType: token.data.token_type,
          scopes: token.data.scope
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean),
        };
      }

      const error = OAuthErrorResponseSchema.safeParse(data);
      if (!error.success) {
        throw new Error(`Invalid GitHub OAuth response: ${token.error.message}`);
      }

      if (error.data.error === "authorization_pending") {
        continue;
      }
      if (error.data.error === "slow_down") {
        interval = error.data.interval ?? interval + 5;
        continue;
      }
      if (error.data.error === "expired_token" || error.data.error === "token_expired") {
        throw new Error(
          "Código expirado (válido por 15 minutos).\n" + "Dica: Pressione R para tentar novamente.",
        );
      }
      if (error.data.error === "access_denied") {
        throw new Error(
          "Acesso negado no GitHub.\n" +
            "Você clicou em 'Cancelar' na página de autorização?\n" +
            "Dica: Pressione R para tentar novamente.",
        );
      }
      throw new Error(
        `Erro no GitHub OAuth: ${error.data.error_description ?? error.data.error}\n` +
          "Dica: Pressione R para tentar novamente.",
      );
    }

    throw new Error(
      "Tempo esgotado aguardando autorização (15 minutos).\n" +
        "Dica: Pressione R para tentar novamente.",
    );
  }
}

async function openVerificationUrl(
  url: string,
  opener: true | ((url: string) => Promise<void>),
): Promise<void> {
  if (typeof opener === "function") {
    await opener(url);
    return;
  }
  await openExternalUrl(url);
}

export function openExternalUrl(url: string): Promise<void> {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  return new Promise((resolve, reject) => {
    const child = execFile(
      command,
      args,
      {
        windowsHide: true,
        timeout: 10_000,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      },
    );
    child.unref();
  });
}

export function normalizeGitHubWebBase(enterpriseUrl?: string): string {
  if (!enterpriseUrl) return "https://github.com";
  return enterpriseUrl.replace(/\/api\/v3\/?$/, "").replace(/\/$/, "");
}

async function postForm(
  url: string,
  body: URLSearchParams,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal,
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    const error = OAuthErrorResponseSchema.safeParse(data);
    throw new Error(
      `GitHub OAuth request failed: ${response.status} ${error.success ? (error.data.error_description ?? error.data.error) : text}`,
    );
  }
  return data;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
