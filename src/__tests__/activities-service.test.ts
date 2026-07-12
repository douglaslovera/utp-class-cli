import { describe, expect, test } from "bun:test";
import { createActivitiesService } from "../services/modules/activities-service";
import type { UtpHttpClient } from "../services/upstream/utp-http-client";

const activities = [
  {
    contentId: "forum-1",
    type: "FORUM",
    activityId: "forum-1",
    activityTitle: "Foro de Consultas - Semana 16",
    evaluationTopScore: 20,
    publishAt: "2026-07-06 00:00:00.000",
    finishAt: "2026-07-12 23:59:59.000",
    isQualificated: false,
    courseId: "course-1",
    sectionId: "section-1",
    weekNumber: 16,
    themeId: "theme-1",
    unityId: "unity-1",
    activityStatusFinal: "IN_PROCESS",
    courseName: "ARQUITECTURA ORIENTADA AL SERVICIO",
    sectionCode: "2262100000SI8424326",
  },
  {
    contentId: "homework-1",
    type: "HOMEWORK",
    activityId: "homework-1",
    activityTitle: "Proyecto Final",
    evaluationTopScore: 20,
    publishAt: "2026-07-11 22:08:20.000",
    finishAt: "2026-07-13 23:59:00.000",
    isQualificated: true,
    courseId: "course-2",
    sectionId: "section-2",
    weekNumber: 18,
    themeId: "theme-2",
    unityId: "unity-2",
    activityStatusFinal: "IN_PROCESS",
    courseName: "TALLER DE INVESTIGACIÓN - SISTEMAS",
    sectionCode: "2262100000SI9528173",
  },
];

describe("activities service", () => {
  test("fetches pending activities from the resume endpoint", async () => {
    const client = {
      async requestApiJson(path: string, init: RequestInit) {
        expect(path).toBe("/course/student/activities/pending/resume");
        expect(init.method).toBe("GET");
        return { data: activities };
      },
    } as unknown as UtpHttpClient;

    expect(await createActivitiesService(client).listPendingActivities()).toEqual(activities);
  });

  test("filters by activity type", async () => {
    const client = {
      async requestApiJson() {
        return { data: activities };
      },
    } as unknown as UtpHttpClient;
    const service = createActivitiesService(client);

    expect((await service.listPendingActivities({ type: "forum" }))[0]?.activityId)
      .toBe("forum-1");
  });
});
