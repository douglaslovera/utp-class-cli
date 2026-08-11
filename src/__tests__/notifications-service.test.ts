import { describe, expect, test } from "bun:test";
import {
  createNotificationsService,
  formatNotificationDate,
  readNotificationDate,
  readNotifications,
} from "../services/modules/notifications-service";
import type { UtpHttpClient } from "../services/upstream/utp-http-client";

describe("notifications service", () => {
  test("uses the current non-default academic period for notifications", async () => {
    const requestedPaths: string[] = [];
    const client = {
      async requestApiJson(path: string) {
        requestedPaths.push(path);

        if (path.endsWith("/academicperiods")) {
          return {
            data: {
              academicPeriods: [
                {
                  id: "default",
                  period: "9999",
                  acadCareer: "PRED",
                  module: "000",
                  name: "Período Predeterminado",
                  start: "1900-01-01",
                  end: "2100-12-31",
                },
                {
                  id: "old",
                  period: "2253",
                  acadCareer: "PREG",
                  module: "001",
                  name: "2025 - Ciclo 3",
                  start: "2025-09-01",
                  end: "2025-12-31",
                },
                {
                  id: "current",
                  period: "2372",
                  acadCareer: "PREG",
                  module: "001",
                  name: "2037 - Ciclo 2",
                  start: "2037-03-23",
                  end: "2037-07-21",
                },
              ],
            },
          };
        }

        return { data: [] };
      },
    } as UtpHttpClient;

    await createNotificationsService(client, "user/id", {
      now: () => new Date(2037, 6, 12),
    }).listNotifications();

    expect(requestedPaths).toEqual([
      "/course/student/user%2Fid/academicperiods",
      "/notification/student/notifications/search/user/user%2Fid?page=1&viewFirstNoSeen=false&period=2372,9999,9999",
    ]);
  });

  test("reads notifications from the upstream response", () => {
    expect(readNotifications({
      success: true,
      data: [{ id: "notif-1", title: "New activity", seen: false }],
    })).toEqual([{ id: "notif-1", title: "New activity", seen: false }]);
  });

  test("rejects responses without a notification array", () => {
    expect(() => readNotifications({ success: true })).toThrow(
      "Notifications response does not contain a data array",
    );
  });

  test("reads the notification timestamp", () => {
    expect(readNotificationDate({
      id: "notif-1",
      title: "New activity",
      seen: false,
      startAt: "2026-07-11 22:08:20",
      descriptiveDate: "11 jul 2026",
      hour: "10:08 PM",
    })).toBe("2026-07-11 22:08:20");
  });

  test("formats the descriptive notification date and time", () => {
    expect(formatNotificationDate({
      id: "notif-1",
      title: "New activity",
      seen: false,
      startAt: "2026-07-11 22:08:20",
      descriptiveDate: "11 jul 2026",
      hour: "10:08 PM",
    })).toBe("11 jul 2026 at 10:08 PM");
  });
});
