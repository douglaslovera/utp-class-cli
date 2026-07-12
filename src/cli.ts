#!/usr/bin/env node
import { cac } from "cac";
import { createTokenStore } from "./cli/token-store";
import { runBrowserLogin } from "./cli/oidc-login";
import { refreshSession } from "./cli/refresh-session";
import { runBrowserCaptureLogin, runHeadlessLogin } from "./cli/browser-capture-login";
import { createCliUtpHttpClient } from "./cli/utp-cli-client";
import { createNotificationsService } from "./services/modules/notifications-service";
import {
  createCoursesService,
  type DashboardCourse,
} from "./services/modules/courses-service";
import { promptPassword, promptText } from "./cli/prompts";
import { AppError } from "./utils/errors";

function formatValue(value: string | null): string {
  return value ?? "unknown";
}

function parseTimeout(value: unknown): number {
  const parsed = Number(value ?? 120);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("--timeout must be a positive number of seconds");
  }

  return parsed;
}

function parseLoginMode(value: unknown): "capture" | "localhost" | "headless" {
  if (value === undefined || value === "capture") {
    return "capture";
  }

  if (value === "localhost" || value === "headless") {
    return value;
  }

  throw new Error("--mode must be 'capture', 'localhost', or 'headless'");
}

function printError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(message);

  if (error instanceof AppError && error.details) {
    console.error(`Details: ${JSON.stringify(error.details, null, 2)}`);
  }
}

async function readHeadlessCredentials(): Promise<{ username: string; password: string }> {
  const username = process.env.UTP_USERNAME?.trim() || await promptText("Email: ");
  const password = process.env.UTP_PASSWORD || await promptPassword("Password: ");

  if (!username || !password) {
    throw new Error("Email and password are required for headless login");
  }

  return { username, password };
}

function parseSeen(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  throw new Error("--seen must be either true or false");
}

function parseOptionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === false) {
    return undefined;
  }

  const parsed = String(value).trim();
  return parsed || undefined;
}

async function resolveUserId(optionUserId?: string): Promise<string> {
  if (optionUserId?.trim()) {
    return optionUserId.trim();
  }

  const session = await store.load();

  if (session?.userId) {
    return session.userId;
  }

  throw new Error(
    "Missing UTP user id. Run `utp config user-id <id>` or pass --user-id <id>.",
  );
}

async function createNotificationsCliService(optionUserId?: string) {
  const userId = await resolveUserId(optionUserId);
  const client = await createCliUtpHttpClient({ store, userId });

  return createNotificationsService(client, userId);
}

async function createCoursesCliService(optionUserId?: string) {
  const userId = await resolveUserId(optionUserId);
  const client = await createCliUtpHttpClient({ store, userId });

  return createCoursesService(client, userId);
}

function formatModality(modality?: string): string {
  switch (modality?.toUpperCase()) {
    case "R":
      return "Remote";
    case "V":
    case "VT":
      return "Virtual 24/7";
    case "P":
      return "Presencial";
    default:
      return modality || "Unknown";
  }
}

function formatCourse(course: DashboardCourse, showTeacherEmail: boolean): string {
  const teacher = [course.teacherFirstName, course.teacherLastName]
    .filter(Boolean)
    .join(" ") || "Unknown";
  const lines = [
    course.name || "Unnamed course",
    `Section: ${course.classNumber || course.sectionCode || "Unknown"}`,
    `Modality: ${formatModality(course.modality)}`,
    `Teacher: ${teacher}`,
  ];

  if (showTeacherEmail) {
    lines.push(`Teacher email: ${course.teacherEmail || "Unknown"}`);
  }

  return lines.join("\n");
}

function formatAcademicPeriods(
  periods: Awaited<ReturnType<ReturnType<typeof createCoursesService>["listAcademicPeriods"]>>,
): string {
  return [...periods]
    .sort((left, right) => right.start.localeCompare(left.start))
    .map((period) =>
      `${period.period}  ${period.name}\n      ${period.start} to ${period.end}`
    )
    .join("\n\n");
}

async function printAcademicPeriods(optionUserId?: string): Promise<void> {
  const service = await createCoursesCliService(optionUserId);
  console.log(formatAcademicPeriods(await service.listAcademicPeriods()));
}

const cli = cac("utp");
const store = createTokenStore();

async function saveUserId(userId: string): Promise<void> {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId) {
    throw new Error("User id cannot be empty");
  }

  const session = await store.load();

  if (!session) {
    throw new Error("No local session found. Run `utp login` first.");
  }

  await store.save({
    ...session,
    userId: trimmedUserId,
    updatedAt: new Date().toISOString(),
  });

  const updatedSession = await store.load();

  console.log("User id saved.");
  console.log(`Session file: ${store.path}`);
  console.log(`User id: ${formatValue(updatedSession?.userId ?? null)}`);
}

async function handleCompatibilityCommands(argv: string[]): Promise<boolean> {
  const [first, second, third] = argv;

  if (first === "config" && second === "user-id") {
    if (!third || third === "--help" || third === "-h") {
      console.log("Usage:");
      console.log("  $ utp config user-id <userId>");
      console.log("");
      console.log("Save the UTP user id used by API commands");
      return true;
    }

    if (third.startsWith("-")) {
      throw new Error("Missing user id. Usage: utp config user-id <userId>");
    }

    await saveUserId(third);
    return true;
  }

  return false;
}

cli
  .command("login", "Open the UTP login flow and save the CLI session")
  .option("--timeout <seconds>", "Seconds to wait for the browser callback", {
    default: 120,
  })
  .option("--mode <mode>", "Login mode: capture, localhost, or headless", {
    default: "capture",
  })
  .action(async (options: { timeout?: string | number; mode?: string }) => {
    try {
      const timeoutSeconds = parseTimeout(options.timeout);
      const mode = parseLoginMode(options.mode);
      console.log(
        mode === "headless"
          ? "Starting headless UTP login..."
          : "Opening browser for UTP login...",
      );
      console.log(`Login mode: ${mode}`);
      console.log(`Waiting up to ${timeoutSeconds} seconds for the login callback.`);

      const result = await (async () => {
        if (mode === "capture") {
          return runBrowserCaptureLogin({ timeoutSeconds });
        }

        if (mode === "headless") {
          const credentials = await readHeadlessCredentials();
          return runHeadlessLogin({ timeoutSeconds }, credentials);
        }

        return runBrowserLogin({ timeoutSeconds });
      })();
      const existingSession = await store.load();
      await store.save({
        ...result.session,
        userId: existingSession?.userId ?? null,
      });

      console.log("Login complete.");
      console.log(`Session file: ${store.path}`);
      console.log(`Refresh token expires: ${formatValue(result.session.refreshTokenExpiresAt)}`);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

cli.command("session", "Show local CLI session status").action(async () => {
  try {
    const session = await store.load();

    if (!session) {
      console.log("Logged in: no");
      console.log("Run `utp login` to authenticate.");
      return;
    }

    console.log("Logged in: yes");
    console.log(`Session file: ${store.path}`);
    console.log(`Refresh token expires: ${formatValue(session.refreshTokenExpiresAt)}`);
    console.log(`Last updated: ${session.updatedAt}`);
    console.log(`User id: ${formatValue(session.userId)}`);
  } catch (error) {
    printError(error);
    process.exitCode = 1;
  }
});

cli.command("refresh", "Refresh the saved CLI session").action(async () => {
  try {
    const session = await store.load();

    if (!session) {
      console.error("No local session found. Run `utp login` first.");
      process.exitCode = 1;
      return;
    }

    const refreshed = await refreshSession(session);
    await store.save(refreshed.session);

    console.log("Session refreshed.");
    console.log(`Refresh token expires: ${formatValue(refreshed.session.refreshTokenExpiresAt)}`);
  } catch (error) {
    printError(error);
    console.error("Run `utp login` to authenticate again.");
    process.exitCode = 1;
  }
});

cli.command("logout", "Remove the local CLI session").action(async () => {
  try {
    await store.clear();
    console.log("Local session removed.");
  } catch (error) {
    printError(error);
    process.exitCode = 1;
  }
});

cli
  .command("config user-id <userId>", "Save the UTP user id used by API commands")
  .action(async (userId: string) => {
    try {
      await saveUserId(userId);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

cli
  .command("notification-seen <notificationId>", "Mark a UTP notification as seen")
  .option("--user-id <id>", "UTP user id for this request")
  .action(async (notificationId: string, options: { userId?: string }) => {
    try {
      const service = await createNotificationsCliService(options.userId);
      const payload = await service.markAsSeen(notificationId);

      console.log(JSON.stringify(payload, null, 2));
    } catch (error) {
      printError(error);
      console.error("Run `utp login` to authenticate again if the session expired.");
      process.exitCode = 1;
    }
  });

cli
  .command("notifications", "List UTP notifications")
  .option("--seen <value>", "Filter by seen status: true or false")
  .option("--user-id <id>", "UTP user id for this request")
  .action(async (options: { seen?: string | boolean; userId?: string }) => {
    try {
      const service = await createNotificationsCliService(options.userId);
      const payload = await service.listNotifications(parseSeen(options.seen));

      console.log(JSON.stringify(payload, null, 2));
    } catch (error) {
      printError(error);
      console.error("Run `utp login` to authenticate again if the session expired.");
      process.exitCode = 1;
    }
  });

cli
  .command("periods", "List available UTP academic periods")
  .option("--user-id <id>", "UTP user id for this request")
  .action(async (options: { userId?: string }) => {
    try {
      await printAcademicPeriods(options.userId);
    } catch (error) {
      printError(error);
      console.error("Run `utp login` to authenticate again if the session expired.");
      process.exitCode = 1;
    }
  });

cli
  .command("courses", "List or search UTP courses")
  .option("--periods", "List the available academic periods")
  .option("--period <period>", "Filter by period code or name")
  .option("--search <text>", "Search courses across all academic periods")
  .option("--teacher-email", "Include the teacher email address")
  .option("--json", "Print the complete filtered response as JSON")
  .option("--user-id <id>", "UTP user id for this request")
  .action(async (options: {
    period?: string | number;
    periods?: boolean;
    search?: string | number;
    teacherEmail?: boolean;
    json?: boolean;
    userId?: string;
  }) => {
    try {
      const service = await createCoursesCliService(options.userId);

      if (options.periods) {
        console.log(formatAcademicPeriods(await service.listAcademicPeriods()));
        return;
      }

      const result = await service.listCourses({
        period: parseOptionalText(options.period),
        search: parseOptionalText(options.search),
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.courses.length === 0) {
        console.log("No courses found.");
        return;
      }

      console.log(result.courses
        .map((course) => formatCourse(course, options.teacherEmail === true))
        .join("\n\n"));
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });

cli.help();

try {
  const handled = await handleCompatibilityCommands(process.argv.slice(2));

  if (!handled) {
    cli.parse();
  }
} catch (error) {
  printError(error);
  process.exitCode = 1;
}
