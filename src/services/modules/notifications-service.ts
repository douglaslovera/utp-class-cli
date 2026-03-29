import type { UtpHttpClient } from "../upstream/utp-http-client";

export interface NotificationsService {
  listNotifications(seen?: boolean): Promise<unknown>;
  markAsSeen(notificationId: string): Promise<unknown>;
}

export function createNotificationsService(
  client: UtpHttpClient,
  userId: string,
): NotificationsService {
  return {
    async listNotifications(seen?: boolean): Promise<unknown> {
      const path =
        "/notification/student/notifications/search/user"
        + `/${encodeURIComponent(userId)}?page=1&viewFirstNoSeen=false&period=2262,9999,9999`;

      const payload = await client.requestApiJson<Record<string, unknown>>(path, {
        method: "GET",
      });

      if (seen === undefined || !Array.isArray(payload.data)) {
        return payload;
      }

      return {
        ...payload,
        data: payload.data.filter((item) => {
          if (!item || typeof item !== "object" || !("seen" in item)) {
            return false;
          }

          return item.seen === seen;
        }),
      };
    },

    markAsSeen(notificationId: string): Promise<unknown> {
      const path =
        "/notification/student/notifications"
        + `/${encodeURIComponent(notificationId)}/to-seen`;

      return client.requestApiJson(path, {
        method: "PATCH",
      });
    },
  };
}
