import type { MiddlewareHandler } from "hono";
import type { AppConfig } from "../types/config";

const PUBLIC_PATHS = new Set(["/health"]);

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
}

export function bearerAuthMiddleware(config: AppConfig): MiddlewareHandler {
  return async (c, next) => {
    const requestPath = new URL(c.req.url).pathname;

    if (PUBLIC_PATHS.has(requestPath)) {
      await next();
      return;
    }

    const providedToken = extractBearerToken(c.req.header("authorization"));

    if (providedToken !== config.api.bearerToken) {
      c.header("WWW-Authenticate", 'Bearer realm="utp-internal-api"');
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Missing or invalid bearer token",
          },
        },
        401,
      );
    }

    await next();
  };
}
