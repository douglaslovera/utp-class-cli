import type { AppConfig } from "../../types/config";
import type { SessionSnapshot, TokenResponse } from "../../types/session";
import { AuthError } from "../../utils/errors";
import {
  buildTokenRequestHeaders,
  readJsonSafely,
  withTimeout,
} from "../../utils/http";

interface SessionServiceOptions {
  config: AppConfig;
  fetchImpl?: typeof fetch;
}

interface TokenRequestFailure {
  type: "invalid_grant" | "other";
  response: Response;
  payload: Record<string, unknown> | null;
}

interface TokenRequestSuccess {
  type: "success";
  payload: TokenResponse;
}

type TokenRequestResult = TokenRequestFailure | TokenRequestSuccess;

export interface SessionService {
  inspect(): SessionSnapshot;
  forceRefresh(): Promise<SessionSnapshot>;
  getValidAccessToken(forceRefresh?: boolean): Promise<string>;
  markAccessTokenExpired(): void;
}

function createFetchClient(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) {
    return fetchImpl;
  }

  return globalThis.fetch.bind(globalThis);
}

export function createSessionService({
  config,
  fetchImpl,
}: SessionServiceOptions): SessionService {
  const request = createFetchClient(fetchImpl);
  let accessToken: string | null = null;
  let accessTokenExpiresAt: number | null = null;
  let currentRefreshToken = config.auth.refreshToken;
  let refreshPromise: Promise<void> | null = null;

  const inspect = (): SessionSnapshot => {
    const now = Date.now();
    const accessTokenExpiresInMs =
      accessTokenExpiresAt === null ? null : Math.max(accessTokenExpiresAt - now, 0);

    return {
      configured: true,
      hasAccessToken: accessToken !== null,
      accessTokenExpiresAt:
        accessTokenExpiresAt === null ? null : new Date(accessTokenExpiresAt).toISOString(),
      accessTokenExpiresInMs,
      hasRuntimeRefreshTokenOverride: currentRefreshToken !== config.auth.refreshToken,
      refreshInFlight: refreshPromise !== null,
    };
  };

  const hasUsableAccessToken = (): boolean => {
    if (!accessToken || !accessTokenExpiresAt) {
      return false;
    }

    return Date.now() < accessTokenExpiresAt - config.auth.accessTokenLeewayMs;
  };

  const storeTokenPayload = (payload: TokenResponse): void => {
    accessToken = payload.access_token;
    accessTokenExpiresAt = Date.now() + payload.expires_in * 1000;

    if (payload.refresh_token) {
      currentRefreshToken = payload.refresh_token;
    }
  };

  const buildFailureDetails = (
    response: Response,
    payload: Record<string, unknown> | null,
  ): Record<string, unknown> => ({
    status: response.status,
    error: payload?.error ?? "unknown_error",
    errorDescription:
      typeof payload?.error_description === "string"
        ? payload.error_description
        : undefined,
  });

  const requestToken = async (includeCookie: boolean): Promise<TokenRequestResult> => {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.auth.clientId,
      redirect_uri: config.auth.redirectUri,
      refresh_token: currentRefreshToken,
    });

    const { signal, cleanup } = withTimeout(config.auth.requestTimeoutMs);

    try {
      const response = await request(config.auth.tokenUrl, {
        method: "POST",
        headers: buildTokenRequestHeaders(config.auth, includeCookie),
        body,
        signal,
      });

      const payload = await readJsonSafely<Record<string, unknown>>(response);

      if (!response.ok) {
        const errorCode = typeof payload?.error === "string" ? payload.error : undefined;
        return {
          type: errorCode === "invalid_grant" ? "invalid_grant" : "other",
          response,
          payload,
        };
      }

      if (
        !payload
        || typeof payload.access_token !== "string"
        || typeof payload.expires_in !== "number"
      ) {
        throw new AuthError("Token endpoint returned an unexpected payload shape", {
          details: { status: response.status },
        });
      }

      return {
        type: "success",
        payload: payload as unknown as TokenResponse,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }

      throw new AuthError("Token endpoint request failed", {
        cause: error,
      });
    } finally {
      cleanup();
    }
  };

  const performRefresh = async (): Promise<void> => {
    const firstAttempt = await requestToken(false);

    if (firstAttempt.type === "success") {
      storeTokenPayload(firstAttempt.payload);
      return;
    }

    if (firstAttempt.type === "invalid_grant") {
      const retryAttempt = await requestToken(true);

      if (retryAttempt.type === "success") {
        storeTokenPayload(retryAttempt.payload);
        return;
      }

      throw new AuthError("Token refresh failed after cookie-backed retry", {
        details: buildFailureDetails(retryAttempt.response, retryAttempt.payload),
      });
    }

    throw new AuthError("Token refresh failed", {
      details: buildFailureDetails(firstAttempt.response, firstAttempt.payload),
    });
  };

  const refreshAccessToken = async (): Promise<void> => {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = performRefresh();

    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  };

  return {
    inspect,
    async forceRefresh(): Promise<SessionSnapshot> {
      await refreshAccessToken();
      return inspect();
    },
    async getValidAccessToken(forceRefresh = false): Promise<string> {
      if (!forceRefresh && hasUsableAccessToken()) {
        return accessToken as string;
      }

      await refreshAccessToken();

      if (!accessToken) {
        throw new AuthError("Access token is unavailable after refresh");
      }

      return accessToken;
    },
    markAccessTokenExpired(): void {
      accessTokenExpiresAt = 0;
    },
  };
}
