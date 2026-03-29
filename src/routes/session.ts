import type { Hono } from "hono";
import { sanitizeSessionSnapshot } from "../utils/redaction";
import type { SessionService } from "../services/auth/session-service";
import type { AppEnv } from "../types/runtime";

interface SessionRouteOptions {
  sessionService: SessionService;
}

export function registerSessionRoutes(
  app: Hono<AppEnv>,
  { sessionService }: SessionRouteOptions,
): void {
  app.get("/session/status", (c) =>
    c.json({
      data: sanitizeSessionSnapshot(sessionService.inspect()),
    }),
  );

  app.post("/session/refresh", async (c) =>
    c.json({
      data: sanitizeSessionSnapshot(await sessionService.forceRefresh()),
    }),
  );
}
