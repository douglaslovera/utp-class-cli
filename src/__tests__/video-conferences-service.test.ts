import { describe, expect, test } from "bun:test";
import {
  createVideoConferencesService,
  selectAvailableVideoConferences,
  selectLatestAvailableVideoConference,
  type VideoConference,
} from "../services/modules/video-conferences-service";
import type { UtpHttpClient } from "../services/upstream/utp-http-client";

function meeting(
  id: string,
  startAt: string,
  caduced: boolean,
): VideoConference {
  return {
    id,
    title: `Meeting ${id}`,
    weekNumber: "Semana 1",
    description: "",
    startAt,
    zoomId: `zoom-${id}`,
    zoomLink: `https://example.test/${id}`,
    duration: "90",
    sectionId: "section-1",
    courseId: "course-1",
    status: "true",
    liveStatus: "",
    caduced,
  };
}

const meetings = [
  meeting("farther", "2026-09-24 18:30:00", false),
  meeting("expired", "2026-08-10 18:30:00", true),
  meeting("latest", "2026-08-13 18:30:00", false),
];

describe("video conferences service", () => {
  test("requests meetings using encoded course and section ids", async () => {
    const client = {
      async requestApiJson(path: string, init: RequestInit) {
        expect(path).toBe(
          "/course/student/video-conference/meeting?courseId=course%2F1&sectionId=section%2F1",
        );
        expect(init.method).toBe("GET");
        return { data: { listVideoConferenceResponse: meetings } };
      },
    } as unknown as UtpHttpClient;

    const result = await createVideoConferencesService(client)
      .listVideoConferences("course/1", "section/1");

    expect(result).toEqual(meetings);
  });

  test("filters expired meetings and sorts the remaining meetings ascending", () => {
    expect(selectAvailableVideoConferences(meetings).map((item) => item.id)).toEqual([
      "latest",
      "farther",
    ]);
  });

  test("selects the closest non-expired meeting as latest", () => {
    expect(selectLatestAvailableVideoConference(meetings)?.id).toBe("latest");
  });

  test("returns undefined when every meeting is expired", () => {
    expect(selectLatestAvailableVideoConference([
      meeting("expired", "2026-08-10 18:30:00", true),
    ])).toBeUndefined();
  });
});
