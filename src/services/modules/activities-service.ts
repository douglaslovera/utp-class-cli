import type { UtpHttpClient } from "../upstream/utp-http-client";

export interface PendingActivity {
  contentId: string;
  type: string;
  activityId: string;
  activityTitle: string;
  evaluationTopScore: number | null;
  publishAt: string;
  finishAt: string;
  isQualificated: boolean;
  courseId: string;
  sectionId: string;
  weekNumber: number;
  themeId: string;
  unityId: string;
  activityStatusFinal: string;
  courseName: string;
  sectionCode: string;
}

interface PendingActivitiesResponse {
  data?: PendingActivity[];
}

export interface ListActivitiesOptions {
  type?: string;
}

export interface ActivitiesService {
  listPendingActivities(options?: ListActivitiesOptions): Promise<PendingActivity[]>;
}

export function createActivitiesService(client: UtpHttpClient): ActivitiesService {
  return {
    async listPendingActivities(
      options: ListActivitiesOptions = {},
    ): Promise<PendingActivity[]> {
      const payload = await client.requestApiJson<PendingActivitiesResponse>(
        "/course/student/activities/pending/resume",
        { method: "GET" },
      );

      if (!Array.isArray(payload.data)) {
        throw new Error("Pending activities response does not contain a data array");
      }

      const type = options.type?.trim().toLocaleUpperCase();

      return payload.data.filter((activity) => {
        const matchesType = !type || activity.type.toLocaleUpperCase() === type;

        return matchesType;
      });
    },
  };
}
