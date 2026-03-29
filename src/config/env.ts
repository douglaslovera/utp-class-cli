import { ConfigError } from "../utils/errors";
import type { AppConfig } from "../types/config";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

export interface AppConfigEnv {
  LOG_LEVEL?: string;
  UTP_REFRESH_TOKEN?: string;
  UTP_COOKIE_HEADER?: string;
  UTP_USER_AGENT?: string;
  UTP_REQUEST_TIMEOUT_MS?: string;
  UTP_USER_ID?: string;
}

function requireEnv(
  env: AppConfigEnv,
  key: "UTP_REFRESH_TOKEN" | "UTP_COOKIE_HEADER" | "UTP_USER_ID",
): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new ConfigError(`Missing required environment variable: ${key}`);
  }

  return value;
}

function parseNumber(
  env: AppConfigEnv,
  key: "UTP_REQUEST_TIMEOUT_MS",
  fallback: number,
): number {
  const rawValue = env[key];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new ConfigError(`Environment variable ${key} must be a positive number`);
  }

  return value;
}

export function loadConfig(env: AppConfigEnv): AppConfig {
  return {
    logLevel: env.LOG_LEVEL?.trim() || "info",
    auth: {
      refreshToken: requireEnv(env, "UTP_REFRESH_TOKEN"),
      cookieHeader: requireEnv(env, "UTP_COOKIE_HEADER"),
      tokenUrl: "https://sso.utp.edu.pe/auth/realms/Xpedition/protocol/openid-connect/token",
      clientId: "pao-web",
      redirectUri: "https://class.utp.edu.pe/student/courses",
      origin: "https://class.utp.edu.pe",
      referer: "https://class.utp.edu.pe/",
      userAgent: env.UTP_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
      requestTimeoutMs: parseNumber(env, "UTP_REQUEST_TIMEOUT_MS", 15_000),
      accessTokenLeewayMs: 60_000,
    },
    upstream: {
      platformBaseUrl: "https://class.utp.edu.pe",
      apiBaseUrl: "https://api-pao.utpxpedition.com",
      userId: requireEnv(env, "UTP_USER_ID"),
      userRole: "STUDENT",
    },
  };
}
