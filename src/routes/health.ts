import type { Hono } from "hono";
import type { AppEnv } from "../types/runtime";

export function registerHealthRoutes(app: Hono<AppEnv>): void {
  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: "utp-internal-api",
    }),
  );
}
