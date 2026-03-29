import type { Hono } from "hono";
import type { NotificationsService } from "../services/modules/notifications-service";
import { BadRequestError } from "../utils/errors";
import type { AppEnv } from "../types/runtime";

interface NotificationsRouteOptions {
  notificationsService: NotificationsService;
}

export function registerNotificationsRoutes(
  app: Hono<AppEnv>,
  { notificationsService }: NotificationsRouteOptions,
): void {
  app.get("/notifications", async (c) => {
    const seen = parseSeenQuery(c.req.query("seen"));

    return c.json({
      data: await notificationsService.listNotifications(seen),
    });
  });

  app.patch("/notifications/:notificationId/seen", async (c) =>
    c.json({
      data: await notificationsService.markAsSeen(c.req.param("notificationId")),
    }),
  );
}

function parseSeenQuery(value?: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new BadRequestError("Query parameter seen must be 'true' or 'false'");
}
