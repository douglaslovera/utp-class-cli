import type { UtpHttpClient } from "../upstream/utp-http-client";

export interface AcademicPeriod {
  id: string;
  period: string;
  acadCareer: string;
  module: string;
  name: string;
  start: string;
  end: string;
}

export interface DashboardCourse {
  period: string;
  acadCareer: string;
  module: string;
  name?: string;
  courseCode?: string;
  sectionCode?: string;
  classNumber?: string;
  modality?: string;
  classroom?: string | null;
  teacherFirstName?: string;
  teacherLastName?: string;
  teacherEmail?: string;
  teachers?: Array<{
    teacherFirstName?: string;
    teacherLastName?: string;
    teacherEmail?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

interface AcademicPeriodsResponse {
  data?: {
    academicPeriods?: AcademicPeriod[];
  };
}

interface DashboardCoursesResponse {
  data?: DashboardCourse[];
}

export interface CurrentCourses {
  date: string;
  academicPeriods: AcademicPeriod[];
  courses: DashboardCourse[];
}

export interface ListCoursesOptions {
  date?: Date;
  period?: string;
  search?: string;
}

export interface CoursesService {
  listAcademicPeriods(): Promise<AcademicPeriod[]>;
  listCourses(options?: ListCoursesOptions): Promise<CurrentCourses>;
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function selectCurrentAcademicPeriod(
  periods: AcademicPeriod[],
  currentDate: string,
): AcademicPeriod {
  if (!isIsoDate(currentDate)) {
    throw new Error(`Invalid current date: ${currentDate}`);
  }

  const matching = periods.filter(
    (period) =>
      isIsoDate(period.start)
      && isIsoDate(period.end)
      && period.start <= currentDate
      && currentDate <= period.end,
  );

  if (matching.length === 0) {
    throw new Error(`No academic period includes ${currentDate}`);
  }

  const specific = matching.filter((period) => period.period !== "9999");
  const candidates = specific.length > 0 ? specific : matching;

  return [...candidates].sort((left, right) =>
    right.start.localeCompare(left.start)
    || left.end.localeCompare(right.end)
  )[0]!;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveAcademicPeriods(
  periods: AcademicPeriod[],
  query: string,
): AcademicPeriod[] {
  const trimmedQuery = query.trim();
  const exact = periods.filter((period) => period.period === trimmedQuery);

  if (exact.length > 0) {
    return exact;
  }

  const words = normalizeSearch(trimmedQuery).split(" ").filter(Boolean);
  const matches = periods.filter((period) => {
    const searchable = normalizeSearch(`${period.name} ${period.period}`);
    return words.length > 0 && words.every((word) => searchable.includes(word));
  });

  const distinctCodes = new Set(matches.map((period) => period.period));

  if (distinctCodes.size > 1) {
    const choices = [...distinctCodes].map((code) => {
      const period = matches.find((item) => item.period === code)!;
      return `${code} (${period.name})`;
    });
    throw new Error(
      `Period "${query}" is ambiguous. Choose one of: ${choices.join(", ")}`,
    );
  }

  if (matches.length === 0) {
    throw new Error(`Academic period "${query}" was not found. Run \`utp courses --periods\`.`);
  }

  return matches;
}

export function createCoursesService(
  client: UtpHttpClient,
  userId: string,
): CoursesService {
  const encodedUserId = encodeURIComponent(userId);

  const listAcademicPeriods = async (): Promise<AcademicPeriod[]> => {
    const periodsPayload = await client.requestApiJson<AcademicPeriodsResponse>(
      `/course/student/${encodedUserId}/academicperiods`,
      { method: "GET" },
    );
    const periods = periodsPayload.data?.academicPeriods;

    if (!Array.isArray(periods)) {
      throw new Error("Academic periods response does not contain an academicPeriods array");
    }

    return periods;
  };

  return {
    listAcademicPeriods,

    async listCourses(options: ListCoursesOptions = {}): Promise<CurrentCourses> {
      const date = options.date ?? new Date();
      const currentDate = formatLocalDate(date);
      const periods = await listAcademicPeriods();

      let academicPeriods: AcademicPeriod[];

      if (options.period) {
        academicPeriods = resolveAcademicPeriods(periods, options.period);
      } else if (options.search?.trim()) {
        academicPeriods = periods;
      } else {
        academicPeriods = [selectCurrentAcademicPeriod(periods, currentDate)];
      }

      const coursesPayload = await client.requestApiJson<DashboardCoursesResponse>(
        `/learning/student/${encodedUserId}/dashboard-courses`,
        { method: "GET" },
      );
      const dashboardCourses = coursesPayload.data;

      if (!Array.isArray(dashboardCourses)) {
        throw new Error("Dashboard courses response does not contain a data array");
      }

      const search = options.search ? normalizeSearch(options.search) : "";
      const courses = dashboardCourses.filter((course) => {
        const matchesPeriod = !options.period && search
          ? true
          : academicPeriods.some((period) =>
            course.period === period.period
            && course.acadCareer === period.acadCareer
            && course.module === period.module
          );
        const teachers = [
          `${course.teacherFirstName ?? ""} ${course.teacherLastName ?? ""}`,
          ...(course.teachers ?? []).flatMap((teacher) => [
            `${teacher.teacherFirstName ?? ""} ${teacher.teacherLastName ?? ""}`,
            teacher.teacherEmail,
          ]),
        ];
        const matchesSearch = !search || [
          course.name,
          course.courseCode,
          course.sectionCode,
          course.classNumber,
          course.teacherFirstName,
          course.teacherLastName,
          course.teacherEmail,
          ...teachers,
        ].some((value) => value && normalizeSearch(value).includes(search));

        return matchesPeriod && matchesSearch;
      });

      return {
        date: currentDate,
        academicPeriods,
        courses,
      };
    },
  };
}
