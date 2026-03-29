import type { AuthConfig } from "../types/config";

export function buildTokenRequestHeaders(
  authConfig: AuthConfig,
  includeCookie: boolean,
): Headers {
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    origin: authConfig.origin,
    referer: authConfig.referer,
    "user-agent": authConfig.userAgent,
  });

  if (includeCookie) {
    headers.set("cookie", authConfig.cookieHeader);
  }

  return headers;
}

export async function readJsonSafely<T>(response: Response): Promise<T | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function readTextSafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function withTimeout(timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout),
  };
}
