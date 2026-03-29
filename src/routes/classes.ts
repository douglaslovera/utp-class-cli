import type { Hono } from "hono";
import type { ClassesService } from "../services/modules/classes-service";
import type { AppEnv } from "../types/runtime";

interface ClassesRouteOptions {
  classesService: ClassesService;
}

export function registerClassesRoutes(
  app: Hono<AppEnv>,
  { classesService }: ClassesRouteOptions,
): void {
  app.get("/classes", async (c) =>
    c.json({
      data: await classesService.listClasses(),
    }),
  );
}
