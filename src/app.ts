import { Hono } from "hono";
import type { AppConfig } from "./types/config";
import type { AppEnv } from "./types/runtime";
import { createSessionService } from "./services/auth/session-service";
import { createUtpHttpClient } from "./services/upstream/utp-http-client";
import { createNotificationsService } from "./services/modules/notifications-service";
import { createCalendarService } from "./services/modules/calendar-service";
import { createEvaluationsService } from "./services/modules/evaluations-service";
import { createClassesService } from "./services/modules/classes-service";
import { registerHealthRoutes } from "./routes/health";
import { registerSessionRoutes } from "./routes/session";
import { registerNotificationsRoutes } from "./routes/notifications";
import { registerCalendarRoutes } from "./routes/calendar";
import { registerEvaluationsRoutes } from "./routes/evaluations";
import { registerClassesRoutes } from "./routes/classes";
import { bearerAuthMiddleware } from "./middleware/bearer-auth";
import { normalizeError, toErrorResponse } from "./utils/errors";

interface BuildAppOptions {
  fetchImpl?: typeof fetch;
}

function serializeAppError(error: unknown): Record<string, unknown> {
  const normalized = normalizeError(error);

  return {
    name: normalized.name,
    code: normalized.code,
    message: normalized.message,
    statusCode: normalized.statusCode,
  };
}

function shouldLog(configuredLevel: string, entryLevel: "debug" | "info" | "error"): boolean {
  const levels = ["debug", "info", "warn", "error", "silent"] as const;
  const configuredIndex = levels.indexOf(
    levels.includes(configuredLevel as (typeof levels)[number])
      ? (configuredLevel as (typeof levels)[number])
      : "info",
  );
  const entryIndex = levels.indexOf(entryLevel);

  return entryIndex >= configuredIndex && configuredIndex < levels.length - 1;
}

function logRequest(
  config: AppConfig,
  level: "info" | "error",
  payload: Record<string, unknown>,
): void {
  if (!shouldLog(config.logLevel, level)) {
    return;
  }

  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}

export function buildApp(
  config: AppConfig,
  options: BuildAppOptions = {},
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const sessionService = createSessionService({
    config,
    fetchImpl: options.fetchImpl,
  });

  const utpHttpClient = createUtpHttpClient({
    config,
    sessionService,
    fetchImpl: options.fetchImpl,
  });

  const notificationsService = createNotificationsService(
    utpHttpClient,
    config.upstream.userId,
  );
  const calendarService = createCalendarService(utpHttpClient);
  const evaluationsService = createEvaluationsService(utpHttpClient);
  const classesService = createClassesService(utpHttpClient);

  app.use("*", async (c, next) => {
    const start = performance.now();
    await next();

    logRequest(config, "info", {
      level: "info",
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      statusCode: c.res.status,
      durationMs: Number((performance.now() - start).toFixed(2)),
    });
  });

  app.use("*", bearerAuthMiddleware(config));

  app.onError((error, c) => {
    const normalized = normalizeError(error);

    logRequest(config, "error", {
      level: "error",
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      statusCode: normalized.statusCode,
      error: serializeAppError(normalized),
    });

    return Response.json(toErrorResponse(normalized), {
      status: normalized.statusCode,
    });
  });

  registerHealthRoutes(app);
  registerSessionRoutes(app, { sessionService });
  registerNotificationsRoutes(app, { notificationsService });
  registerCalendarRoutes(app, { calendarService });
  registerEvaluationsRoutes(app, { evaluationsService });
  registerClassesRoutes(app, { classesService });

  return app;
}
