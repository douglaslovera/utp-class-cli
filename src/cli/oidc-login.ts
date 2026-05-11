import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { UTP_AUTH } from "./auth-constants";
import { createPkcePair, createState } from "./pkce";
import { openBrowser } from "./open-browser";
import type { StoredSession } from "./token-store";

export interface LoginOptions {
  timeoutSeconds: number;
  fetchImpl?: typeof fetch;
}

interface TokenPayload {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  id_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface LoginResult {
  session: StoredSession;
}

function htmlResponse(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body><h1>${title}</h1><p>${body}</p></body>
</html>`;
}

function sendHtml(response: ServerResponse, statusCode: number, title: string, body: string): void {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(htmlResponse(title, body));
}

function computeRefreshExpiry(refreshExpiresIn: number | undefined): string | null {
  if (typeof refreshExpiresIn !== "number" || refreshExpiresIn <= 0) {
    return null;
  }

  return new Date(Date.now() + refreshExpiresIn * 1000).toISOString();
}

export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
  fetchImpl?: typeof fetch,
): Promise<StoredSession> {
  const request = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: UTP_AUTH.clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: codeVerifier,
  });

  const response = await request(UTP_AUTH.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = (await response.json().catch(() => null)) as TokenPayload | null;

  if (!response.ok || !payload?.refresh_token) {
    const description = payload?.error_description ?? payload?.error ?? response.statusText;
    throw new Error(`Token exchange failed: ${description}`);
  }

  return {
    refreshToken: payload.refresh_token,
    refreshTokenExpiresAt: computeRefreshExpiry(payload.refresh_expires_in),
    idToken: payload.id_token ?? null,
    tokenType: payload.token_type ?? "Bearer",
    updatedAt: new Date().toISOString(),
    userId: null,
  };
}

export async function runBrowserLogin(options: LoginOptions): Promise<LoginResult> {
  const state = createState();
  const pkce = createPkcePair();
  const timeoutMs = options.timeoutSeconds * 1000;

  let resolveCode: (code: string) => void;
  let rejectCode: (error: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (requestUrl.pathname !== "/callback") {
      sendHtml(response, 404, "Not found", "This local login server only accepts /callback.");
      return;
    }

    const receivedState = requestUrl.searchParams.get("state");
    const error = requestUrl.searchParams.get("error");
    const errorDescription = requestUrl.searchParams.get("error_description");
    const code = requestUrl.searchParams.get("code");

    if (error) {
      sendHtml(response, 400, "Login failed", "Return to the terminal for details.");
      rejectCode(new Error(errorDescription ?? error));
      return;
    }

    if (receivedState !== state) {
      sendHtml(response, 400, "Login failed", "Return to the terminal for details.");
      rejectCode(new Error("Login state did not match"));
      return;
    }

    if (!code) {
      sendHtml(response, 400, "Login failed", "Return to the terminal for details.");
      rejectCode(new Error("Callback did not include an authorization code"));
      return;
    }

    sendHtml(response, 200, "Login complete", "You can return to the terminal.");
    resolveCode(code);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;
  const authorizationUrl = new URL(UTP_AUTH.authorizationUrl);
  authorizationUrl.searchParams.set("client_id", UTP_AUTH.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", UTP_AUTH.scope);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", pkce.challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  const timeout = setTimeout(() => {
    rejectCode(new Error(`Login timed out after ${options.timeoutSeconds} seconds`));
  }, timeoutMs);

  try {
    openBrowser(authorizationUrl.toString());
    const code = await codePromise;
    const session = await exchangeAuthorizationCode(
      code,
      redirectUri,
      pkce.verifier,
      options.fetchImpl,
    );
    return { session };
  } finally {
    clearTimeout(timeout);
    server.close();
  }
}
