import { UpstreamMappingPendingError } from "../../utils/errors";
import type { UtpHttpClient } from "../upstream/utp-http-client";

export interface CalendarService {
  listCalendarEvents(): Promise<never>;
}

export function createCalendarService(client: UtpHttpClient): CalendarService {
  void client;

  return {
    async listCalendarEvents(): Promise<never> {
      throw new UpstreamMappingPendingError("Calendar upstream mapping is pending");
    },
  };
}
