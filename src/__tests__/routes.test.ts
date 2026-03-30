import { describe, expect, test } from "bun:test";
import { buildApp } from "../app";
import { loadConfig } from "../config/env";

const config = loadConfig({
  API_BEARER_TOKEN: "api-token",
  UTP_REFRESH_TOKEN: "refresh-token",
  UTP_COOKIE_HEADER: "SESSION=abc",
  UTP_USER_ID: "123456",
});

const authHeaders = {
  Authorization: `Bearer ${config.api.bearerToken}`,
};

function createTokenResponse(): Response {
  return new Response(
    JSON.stringify({
      access_token: "live-access-token",
      expires_in: 300,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

function createNotificationsResponse(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      code: 2,
      message: "",
      data: [
        {
          id: "notif-1",
          title: "Nueva notificacion",
          seen: false,
        },
        {
          id: "notif-2",
          title: "Notificacion leida",
          seen: true,
        },
      ],
      idTransaction: "f5bf22a2-c5cb-4a67-a847-030d7f1cf201",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

function createMarkAsSeenResponse(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      code: 2,
      message: "",
      data: "ok",
      idTransaction: "6072205a-fb24-4bab-8b39-2f277dd72d1b",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

describe("HTTP routes", () => {
  test("GET /health returns service status", async () => {
    const app = buildApp(config, {
      fetchImpl: (async () => createTokenResponse()) as unknown as typeof fetch,
    });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect((await response.json()) as { status: string; service: string }).toEqual({
      status: "ok",
      service: "utp-internal-api",
    });
  });

  test("GET /session/status returns sanitized metadata only", async () => {
    const app = buildApp(config, {
      fetchImpl: (async () => createTokenResponse()) as unknown as typeof fetch,
    });

    const response = await app.request("/session/status", {
      headers: authHeaders,
      method: "GET",
    });

    const responseBody = await response.text();

    expect(response.status).toBe(200);
    expect(responseBody).not.toContain(config.auth.refreshToken);
    expect(responseBody).not.toContain(config.auth.cookieHeader);
  });

  test("POST /session/refresh refreshes the session without exposing tokens", async () => {
    const app = buildApp(config, {
      fetchImpl: (async () => createTokenResponse()) as unknown as typeof fetch,
    });

    const response = await app.request("/session/refresh", {
      headers: authHeaders,
      method: "POST",
    });

    const responseBody = await response.text();

    expect(response.status).toBe(200);
    expect(responseBody).not.toContain("live-access-token");
    const payload = JSON.parse(responseBody) as {
      data: {
        hasAccessToken: boolean;
      };
    };
    expect(payload.data.hasAccessToken).toBe(true);
  });

  test("GET /notifications returns the upstream notifications payload", async () => {
    const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
      const stringUrl = String(url);

      if (stringUrl === config.auth.tokenUrl) {
        return createTokenResponse();
      }

      expect(stringUrl).toBe(
        "https://api-pao.utpxpedition.com/notification/student/notifications/search/user/123456?page=1&viewFirstNoSeen=false&period=2262,9999,9999",
      );

      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer live-access-token");
      expect(headers.get("user-id")).toBe("123456");
      expect(headers.get("user-role")).toBe("STUDENT");

      return createNotificationsResponse();
    }) as unknown as typeof fetch;

    const currentApp = await buildApp(config, {
      fetchImpl: fetchMock,
    });

    const response = await currentApp.request("/notifications", {
      headers: authHeaders,
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(
      (await response.json()) as {
        data: {
          success: boolean;
          code: number;
          message: string;
          data: Array<{ id: string; title: string; seen: boolean }>;
          idTransaction: string;
        };
      },
    ).toEqual({
      data: {
        success: true,
        code: 2,
        message: "",
        data: [
          {
            id: "notif-1",
            title: "Nueva notificacion",
            seen: false,
          },
          {
            id: "notif-2",
            title: "Notificacion leida",
            seen: true,
          },
        ],
        idTransaction: "f5bf22a2-c5cb-4a67-a847-030d7f1cf201",
      },
    });
  });

  test("GET /notifications?seen=false filters notifications by the seen flag", async () => {
    const fetchMock = (async (url: string | URL | Request) => {
      const stringUrl = String(url);

      if (stringUrl === config.auth.tokenUrl) {
        return createTokenResponse();
      }

      return createNotificationsResponse();
    }) as unknown as typeof fetch;

    const app = buildApp(config, {
      fetchImpl: fetchMock,
    });

    const response = await app.request("/notifications?seen=false", {
      headers: authHeaders,
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(
      (await response.json()) as {
        data: {
          success: boolean;
          code: number;
          message: string;
          data: Array<{ id: string; title: string; seen: boolean }>;
          idTransaction: string;
        };
      },
    ).toEqual({
      data: {
        success: true,
        code: 2,
        message: "",
        data: [
          {
            id: "notif-1",
            title: "Nueva notificacion",
            seen: false,
          },
        ],
        idTransaction: "f5bf22a2-c5cb-4a67-a847-030d7f1cf201",
      },
    });
  });

  test("GET /notifications rejects invalid seen filters", async () => {
    const app = buildApp(config, {
      fetchImpl: (async () => createTokenResponse()) as unknown as typeof fetch,
    });

    const response = await app.request("/notifications?seen=maybe", {
      headers: authHeaders,
      method: "GET",
    });

    expect(response.status).toBe(400);
    expect(
      (await response.json()) as {
        error: {
          code: string;
          message: string;
        };
      },
    ).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Query parameter seen must be 'true' or 'false'",
      },
    });
  });

  test("PATCH /notifications/:notificationId/seen marks the notification as read", async () => {
    const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
      const stringUrl = String(url);

      if (stringUrl === config.auth.tokenUrl) {
        return createTokenResponse();
      }

      expect(stringUrl).toBe(
        "https://api-pao.utpxpedition.com/notification/student/notifications/notif-1/to-seen",
      );
      expect(init?.method).toBe("PATCH");

      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer live-access-token");
      expect(headers.get("user-id")).toBe("123456");
      expect(headers.get("user-role")).toBe("STUDENT");

      return createMarkAsSeenResponse();
    }) as unknown as typeof fetch;

    const app = buildApp(config, {
      fetchImpl: fetchMock,
    });

    const response = await app.request("/notifications/notif-1/seen", {
      headers: authHeaders,
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(
      (await response.json()) as {
        data: {
          success: boolean;
          code: number;
          message: string;
          data: string;
          idTransaction: string;
        };
      },
    ).toEqual({
      data: {
        success: true,
        code: 2,
        message: "",
        data: "ok",
        idTransaction: "6072205a-fb24-4bab-8b39-2f277dd72d1b",
      },
    });
  });

  for (const url of ["/calendar", "/evaluations", "/classes"]) {
    test(`${url} returns an upstream mapping pending error`, async () => {
      const app = buildApp(config, {
        fetchImpl: (async () => createTokenResponse()) as unknown as typeof fetch,
      });

      const response = await app.request(url, {
        headers: authHeaders,
        method: "GET",
      });

      expect(response.status).toBe(501);
      expect(
        (await response.json()) as {
          error: { code: string; message: string };
        },
      ).toEqual({
        error: {
          code: "UPSTREAM_MAPPING_PENDING",
          message: expect.any(String),
        },
      });
    });
  }

  test("non-health routes reject requests without a bearer token", async () => {
    let fetchCalls = 0;
    const app = buildApp(config, {
      fetchImpl: (async () => {
        fetchCalls += 1;
        return createTokenResponse();
      }) as unknown as typeof fetch,
    });

    const response = await app.request("/notifications", {
      method: "GET",
    });

    expect(response.status).toBe(401);
    expect((await response.json()) as { error: { code: string; message: string } }).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid bearer token",
      },
    });
    expect(fetchCalls).toBe(0);
  });

  test("non-health routes reject requests with an invalid bearer token", async () => {
    const app = buildApp(config, {
      fetchImpl: (async () => createTokenResponse()) as unknown as typeof fetch,
    });

    const response = await app.request("/session/status", {
      headers: {
        Authorization: "Bearer wrong-token",
      },
      method: "GET",
    });

    expect(response.status).toBe(401);
    expect((await response.json()) as { error: { code: string; message: string } }).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing or invalid bearer token",
      },
    });
  });
});
