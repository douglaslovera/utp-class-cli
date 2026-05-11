import { UTP_AUTH } from "./auth-constants";
import { refreshSession } from "./refresh-session";
import type { StoredSession, TokenStore } from "./token-store";
import type { AppConfig } from "../types/config";
import type { SessionService } from "../services/auth/session-service";
import { createUtpHttpClient } from "../services/upstream/utp-http-client";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

export interface CliUtpClientOptions {
  store: TokenStore;
  userId: string;
  fetchImpl?: typeof fetch;
}

function createCliConfig(userId: string): AppConfig {
  return {
    logLevel: "info",
    api: {
      bearerToken: "",
    },
    auth: {
      refreshToken: "",
      cookieHeader: "",
      tokenUrl: UTP_AUTH.tokenUrl,
      clientId: UTP_AUTH.clientId,
      redirectUri: UTP_AUTH.classRedirectUri,
      origin: "https://class.utp.edu.pe",
      referer: "https://class.utp.edu.pe/",
      userAgent: process.env.UTP_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
      requestTimeoutMs: 15_000,
      accessTokenLeewayMs: 60_000,
    },
    upstream: {
      platformBaseUrl: "https://class.utp.edu.pe",
      apiBaseUrl: "https://api-pao.utpxpedition.com",
      userId,
      userRole: "STUDENT",
    },
  };
}

export async function createCliUtpHttpClient({
  store,
  userId,
  fetchImpl,
}: CliUtpClientOptions) {
  let session = await store.load();
  let accessToken: string | null = null;

  if (!session) {
    throw new Error("No local session found. Run `utp login` first.");
  }

  const refresh = async (): Promise<void> => {
    if (!session) {
      throw new Error("No local session found. Run `utp login` first.");
    }

    const result = await refreshSession(session, fetchImpl);
    session = result.session;
    accessToken = result.accessToken;
    await store.save(result.session);
  };

  const sessionService: SessionService = {
    inspect() {
      return {
        configured: true,
        hasAccessToken: accessToken !== null,
        accessTokenExpiresAt: null,
        accessTokenExpiresInMs: null,
        hasRuntimeRefreshTokenOverride: true,
        refreshInFlight: false,
      };
    },
    async forceRefresh() {
      await refresh();
      return this.inspect();
    },
    async getValidAccessToken(forceRefresh = false) {
      if (!accessToken || forceRefresh) {
        await refresh();
      }

      if (!accessToken) {
        throw new Error("Access token is unavailable after refresh");
      }

      return accessToken;
    },
    markAccessTokenExpired() {
      accessToken = null;
    },
  };

  return createUtpHttpClient({
    config: createCliConfig(userId),
    sessionService,
    fetchImpl,
  });
}

