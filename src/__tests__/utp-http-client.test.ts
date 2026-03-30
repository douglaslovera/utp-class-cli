import { describe, expect, mock, test } from "bun:test";
import { loadConfig } from "../config/env";
import { createUtpHttpClient } from "../services/upstream/utp-http-client";
import { UpstreamError } from "../utils/errors";

const config = loadConfig({
  API_BEARER_TOKEN: "api-token",
  UTP_REFRESH_TOKEN: "refresh-token",
  UTP_COOKIE_HEADER: "SESSION=abc",
  UTP_USER_ID: "123456",
});

function createSessionServiceStub() {
  return {
    getValidAccessToken: mock(async () => "access-token"),
    markAccessTokenExpired: mock(() => {}),
  };
}

describe("UtpHttpClient", () => {
  test("injects the bearer token", async () => {
    const sessionService = createSessionServiceStub();
    const fetchMock = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer access-token");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createUtpHttpClient({
      config,
      sessionService: sessionService as never,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.request("/student/courses");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("uses the API base URL and platform headers when requested", async () => {
    const sessionService = createSessionServiceStub();
    const fetchMock = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      expect(String(url)).toBe(
        "https://api-pao.utpxpedition.com/notification/student/notifications/search/user/123456?page=1",
      );
      expect(headers.get("authorization")).toBe("Bearer access-token");
      expect(headers.get("origin")).toBe("https://class.utp.edu.pe");
      expect(headers.get("referer")).toBe("https://class.utp.edu.pe/");
      expect(headers.get("user-id")).toBe("123456");
      expect(headers.get("user-role")).toBe("STUDENT");

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createUtpHttpClient({
      config,
      sessionService: sessionService as never,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.requestApiJson(
      "/notification/student/notifications/search/user/123456?page=1",
      {
        method: "GET",
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("retries once after a 401 response", async () => {
    const sessionService = {
      getValidAccessToken: mock(async (forceRefresh?: boolean) =>
        forceRefresh ? "access-token-2" : "access-token-1",
      ),
      markAccessTokenExpired: mock(() => {}),
    };

    let callCount = 0;
    const fetchMock = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      callCount += 1;
      const headers = new Headers(init?.headers);

      if (callCount === 1) {
        expect(headers.get("authorization")).toBe("Bearer access-token-1");
        return new Response(null, { status: 401 });
      }

      expect(headers.get("authorization")).toBe("Bearer access-token-2");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createUtpHttpClient({
      config,
      sessionService: sessionService as never,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.request("/student/courses");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sessionService.markAccessTokenExpired).toHaveBeenCalledTimes(1);
  });

  test("maps network failures to an upstream error", async () => {
    const sessionService = createSessionServiceStub();
    const fetchMock = mock(async () => {
      throw new Error("connect ETIMEDOUT");
    });

    const client = createUtpHttpClient({
      config,
      sessionService: sessionService as never,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.request("/student/courses")).rejects.toBeInstanceOf(UpstreamError);
  });
});
