import type { Hono } from "hono";
import type { EvaluationsService } from "../services/modules/evaluations-service";
import type { AppEnv } from "../types/runtime";

interface EvaluationsRouteOptions {
  evaluationsService: EvaluationsService;
}

export function registerEvaluationsRoutes(
  app: Hono<AppEnv>,
  { evaluationsService }: EvaluationsRouteOptions,
): void {
  app.get("/evaluations", async (c) =>
    c.json({
      data: await evaluationsService.listEvaluations(),
    }),
  );
}
