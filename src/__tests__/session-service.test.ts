import { describe, expect, mock, test } from "bun:test";
import { loadConfig } from "../config/env";
import { createSessionService } from "../services/auth/session-service";
import { AuthError } from "../utils/errors";

const config = loadConfig({
  API_BEARER_TOKEN: "api-token",
  UTP_REFRESH_TOKEN: "initial-refresh-token",
  UTP_COOKIE_HEADER: "AUTH_SESSION_ID=abc123",
  UTP_USER_ID: "123456",
});

function createTokenResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("SessionService", () => {
  test("refresh succeeds on the first attempt", async () => {
    const fetchMock = mock(async () =>
      createTokenResponse({
        access_token: "access-token-1",
        expires_in: 300,
      }),
    );

    const service = createSessionService({
      config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const accessToken = await service.getValidAccessToken();

    expect(accessToken).toBe("access-token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(service.inspect().hasAccessToken).toBe(true);
  });

  test("invalid_grant triggers a cookie-backed retry", async () => {
    const fetchMock = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      if (!headers.has("cookie")) {
        return createTokenResponse(
          {
            error: "invalid_grant",
          },
          400,
        );
      }

      expect(headers.get("cookie")).toBe(config.auth.cookieHeader);

      return createTokenResponse({
        access_token: "access-token-2",
        expires_in: 300,
      });
    });

    const service = createSessionService({
      config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const accessToken = await service.getValidAccessToken();

    expect(accessToken).toBe("access-token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("retry failure surfaces a sanitized auth error", async () => {
    const fetchMock = mock(async () =>
      createTokenResponse(
        {
          error: "invalid_grant",
          error_description: "session expired",
        },
        400,
      ),
    );

    const service = createSessionService({
      config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(service.getValidAccessToken()).rejects.toBeInstanceOf(AuthError);

    await expect(service.getValidAccessToken()).rejects.not.toThrow(config.auth.refreshToken);
    await expect(service.getValidAccessToken()).rejects.not.toThrow(config.auth.cookieHeader);
  });

  test("rotated refresh tokens are kept in memory only", async () => {
    const fetchMock = mock(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const body = init?.body as URLSearchParams;
        const refreshToken = body.get("refresh_token");

        if (refreshToken === "initial-refresh-token") {
          return createTokenResponse({
            access_token: "access-token-3",
            refresh_token: "rotated-refresh-token",
            expires_in: 300,
          });
        }

        expect(refreshToken).toBe("rotated-refresh-token");

        return createTokenResponse({
          access_token: "access-token-4",
          expires_in: 300,
        });
      },
    );

    const service = createSessionService({
      config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await service.forceRefresh();
    await service.forceRefresh();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(service.inspect().hasRuntimeRefreshTokenOverride).toBe(true);
  });

  test("access token refreshes before the expiry threshold", async () => {
    let callCount = 0;
    const fetchMock = mock(async () => {
      callCount += 1;

      return createTokenResponse({
        access_token: `access-token-${callCount}`,
        expires_in: 30,
      });
    });

    const service = createSessionService({
      config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const firstToken = await service.getValidAccessToken();
    const secondToken = await service.getValidAccessToken();

    expect(firstToken).toBe("access-token-1");
    expect(secondToken).toBe("access-token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
