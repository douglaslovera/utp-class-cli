import type { UtpHttpClient } from "../upstream/utp-http-client";

export interface UtpNotification {
  id: string;
  title: string;
  seen: boolean;
  startAt?: string;
  descriptiveDate?: string;
  hour?: string;
  createdAt?: string;
  sentAt?: string;
  publishAt?: string;
  date?: string;
  [key: string]: unknown;
}

export interface NotificationsPayload {
  success?: boolean;
  code?: number;
  message?: string;
  data?: UtpNotification[];
  idTransaction?: string;
  [key: string]: unknown;
}

export interface NotificationsService {
  listNotifications(seen?: boolean): Promise<NotificationsPayload>;
  markAsSeen(notificationId: string): Promise<unknown>;
}

export function readNotifications(payload: NotificationsPayload): UtpNotification[] {
  if (!Array.isArray(payload.data)) {
    throw new Error("Notifications response does not contain a data array");
  }

  return payload.data;
}

export function readNotificationDate(notification: UtpNotification): string | null {
  const candidates = [
    notification.startAt,
    notification.createdAt,
    notification.sentAt,
    notification.publishAt,
    notification.date,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim()) ?? null;
}

export function formatNotificationDate(notification: UtpNotification): string | null {
  if (notification.descriptiveDate?.trim() && notification.hour?.trim()) {
    return `${notification.descriptiveDate.trim()} at ${notification.hour.trim()}`;
  }

  return readNotificationDate(notification);
}

export function createNotificationsService(
  client: UtpHttpClient,
  userId: string,
): NotificationsService {
  return {
    async listNotifications(seen?: boolean): Promise<NotificationsPayload> {
      const path =
        "/notification/student/notifications/search/user"
        + `/${encodeURIComponent(userId)}?page=1&viewFirstNoSeen=false&period=2262,9999,9999`;

      const payload = await client.requestApiJson<NotificationsPayload>(path, {
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
