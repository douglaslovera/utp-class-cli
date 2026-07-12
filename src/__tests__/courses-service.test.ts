import { describe, expect, test } from "bun:test";
import {
  createCoursesService,
  formatLocalDate,
  resolveAcademicPeriods,
  selectCurrentAcademicPeriod,
  type AcademicPeriod,
} from "../services/modules/courses-service";
import type { UtpHttpClient } from "../services/upstream/utp-http-client";

const periods: AcademicPeriod[] = [
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
    id: "current",
    period: "2262",
    acadCareer: "PREG",
    module: "001",
    name: "2026 - Ciclo 1 Marzo PREG (001)",
    start: "2026-03-23",
    end: "2026-07-21",
  },
];

describe("courses service", () => {
  test("formats the current local date as YYYY-MM-DD", () => {
    expect(formatLocalDate(new Date(2026, 6, 12, 23, 30))).toBe("2026-07-12");
  });

  test("prefers a dated period over the overlapping 9999 default", () => {
    expect(selectCurrentAcademicPeriod(periods, "2026-07-12").period).toBe("2262");
  });

  test("resolves a period by code or words from its name", () => {
    expect(resolveAcademicPeriods(periods, "2262")[0]?.id).toBe("current");
    expect(resolveAcademicPeriods(periods, "2026 ciclo 1")[0]?.id).toBe("current");
  });

  test("fetches periods first and returns only courses for the current period", async () => {
    const requestedPaths: string[] = [];
    const client = {
      async requestApiJson(path: string) {
        requestedPaths.push(path);

        if (path.endsWith("/academicperiods")) {
          return { data: { academicPeriods: periods } };
        }

        return {
          data: [
            { name: "Current", period: "2262", acadCareer: "PREG", module: "001" },
            { name: "Old", period: "2253", acadCareer: "PREG", module: "001" },
            { name: "Default", period: "9999", acadCareer: "PRED", module: "000" },
          ],
        };
      },
    } as UtpHttpClient;

    const result = await createCoursesService(client, "user/id").listCourses({
      date: new Date(2026, 6, 12),
    });

    expect(requestedPaths).toEqual([
      "/course/student/user%2Fid/academicperiods",
      "/learning/student/user%2Fid/dashboard-courses",
    ]);
    expect(result.date).toBe("2026-07-12");
    expect(result.academicPeriods[0]?.period).toBe("2262");
    expect(result.courses.map((course) => course.name)).toEqual(["Current"]);
  });

  test("searches courses across periods", async () => {
    const client = {
      async requestApiJson(path: string) {
        if (path.endsWith("/academicperiods")) {
          return { data: { academicPeriods: periods } };
        }

        return {
          data: [
            { name: "Current", period: "2262", acadCareer: "PREG", module: "001" },
            { name: "Older Web Course", period: "2253", acadCareer: "PREG", module: "001" },
          ],
        };
      },
    } as UtpHttpClient;

    const result = await createCoursesService(client, "user").listCourses({ search: "web" });

    expect(result.courses.map((course) => course.name)).toEqual(["Older Web Course"]);
  });

  test("searches by a teacher's full name", async () => {
    const client = {
      async requestApiJson(path: string) {
        if (path.endsWith("/academicperiods")) {
          return { data: { academicPeriods: periods } };
        }

        return {
          data: [
            {
              name: "Architecture",
              period: "2262",
              acadCareer: "PREG",
              module: "001",
              teacherFirstName: "JESUS FRANCISCO",
              teacherLastName: "MINAYA ISIQUE",
            },
            {
              name: "Research",
              period: "2262",
              acadCareer: "PREG",
              module: "001",
              teachers: [
                { teacherFirstName: "MARCOS TEODORO", teacherLastName: "YERREN HUIMA" },
              ],
            },
          ],
        };
      },
    } as UtpHttpClient;
    const service = createCoursesService(client, "user");

    expect((await service.listCourses({ search: "Jesus Francisco Minaya" })).courses[0]?.name)
      .toBe("Architecture");
    expect((await service.listCourses({ search: "Marcos Teodoro Yerren" })).courses[0]?.name)
      .toBe("Research");
  });
});
