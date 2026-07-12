import { describe, expect, test } from "bun:test";
import {
  formatNotificationDate,
  readNotificationDate,
  readNotifications,
} from "../services/modules/notifications-service";

describe("notifications service", () => {
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
