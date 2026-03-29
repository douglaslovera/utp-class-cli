import type { Hono } from "hono";
import type { CalendarService } from "../services/modules/calendar-service";
import type { AppEnv } from "../types/runtime";

interface CalendarRouteOptions {
  calendarService: CalendarService;
}

export function registerCalendarRoutes(
  app: Hono<AppEnv>,
  { calendarService }: CalendarRouteOptions,
): void {
  app.get("/calendar", async (c) =>
    c.json({
      data: await calendarService.listCalendarEvents(),
    }),
  );
}
