import type { UtpHttpClient } from "../upstream/utp-http-client";

export interface VideoConference {
  id: string;
  title: string;
  weekNumber: string;
  description: string;
  startAt: string;
  zoomId: string;
  zoomLink: string;
  duration: string;
  sectionId: string;
  courseId: string;
  status: string;
  liveStatus: string;
  caduced: boolean;
  [key: string]: unknown;
}

interface VideoConferencesResponse {
  data?: {
    listVideoConferenceResponse?: VideoConference[];
  };
}

export interface VideoConferencesService {
  listVideoConferences(courseId: string, sectionId: string): Promise<VideoConference[]>;
}

export function selectAvailableVideoConferences(
  meetings: VideoConference[],
): VideoConference[] {
  return meetings
    .filter((meeting) => meeting.caduced !== true)
    .sort((left, right) =>
      left.startAt.localeCompare(right.startAt)
      || left.id.localeCompare(right.id)
    );
}

export function selectLatestAvailableVideoConference(
  meetings: VideoConference[],
): VideoConference | undefined {
  return selectAvailableVideoConferences(meetings)[0];
}

export function createVideoConferencesService(
  client: UtpHttpClient,
): VideoConferencesService {
  return {
    async listVideoConferences(
      courseId: string,
      sectionId: string,
    ): Promise<VideoConference[]> {
      const query = new URLSearchParams({ courseId, sectionId });
      const payload = await client.requestApiJson<VideoConferencesResponse>(
        `/course/student/video-conference/meeting?${query.toString()}`,
        { method: "GET" },
      );
      const meetings = payload.data?.listVideoConferenceResponse;

      if (!Array.isArray(meetings)) {
        throw new Error(
          "Video conferences response does not contain a listVideoConferenceResponse array",
        );
      }

      return meetings;
    },
  };
}
