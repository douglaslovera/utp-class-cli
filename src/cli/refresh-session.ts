import { UTP_AUTH } from "./auth-constants";
import type { StoredSession } from "./token-store";

interface RefreshPayload {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  id_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface RefreshResult {
  accessToken: string;
  session: StoredSession;
}

function computeRefreshExpiry(refreshExpiresIn: number | undefined): string | null {
  if (typeof refreshExpiresIn !== "number" || refreshExpiresIn <= 0) {
    return null;
  }

  return new Date(Date.now() + refreshExpiresIn * 1000).toISOString();
}

export async function refreshSession(
  session: StoredSession,
  fetchImpl?: typeof fetch,
): Promise<RefreshResult> {
  const request = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: UTP_AUTH.clientId,
    refresh_token: session.refreshToken,
  });

  const response = await request(UTP_AUTH.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json().catch(() => null)) as RefreshPayload | null;

  if (!response.ok || !payload?.access_token) {
    const description = payload?.error_description ?? payload?.error ?? response.statusText;
    throw new Error(`Session refresh failed: ${description}`);
  }

  return {
    accessToken: payload.access_token,
    session: {
      refreshToken: payload.refresh_token ?? session.refreshToken,
      refreshTokenExpiresAt:
        payload.refresh_token || payload.refresh_expires_in
          ? computeRefreshExpiry(payload.refresh_expires_in)
          : session.refreshTokenExpiresAt,
      idToken: payload.id_token ?? session.idToken,
      tokenType: payload.token_type ?? session.tokenType,
      updatedAt: new Date().toISOString(),
      userId: session.userId,
    },
  };
}
