#!/usr/bin/env node
import { cac } from "cac";
import { createTokenStore } from "./cli/token-store";
import { runBrowserLogin } from "./cli/oidc-login";
import { refreshSession } from "./cli/refresh-session";
import { runBrowserCaptureLogin } from "./cli/browser-capture-login";
import { createCliUtpHttpClient } from "./cli/utp-cli-client";
import { createNotificationsService } from "./services/modules/notifications-service";

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

function parseLoginMode(value: unknown): "capture" | "localhost" {
  if (value === undefined || value === "capture") {
    return "capture";
  }

  if (value === "localhost") {
    return "localhost";
  }

  throw new Error("--mode must be either 'capture' or 'localhost'");
}

function printError(error: unknown): void {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(message);
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

async function resolveUserId(optionUserId?: string): Promise<string> {
  if (optionUserId?.trim()) {
    return optionUserId.trim();
  }

  const session = await store.load();

  if (session?.userId) {
    return session.userId;
  }

  if (process.env.UTP_USER_ID?.trim()) {
    return process.env.UTP_USER_ID.trim();
  }

  throw new Error("Missing UTP user id. Run `utp config user-id <id>` or pass --user-id <id>.");
}

async function createNotificationsCliService(optionUserId?: string) {
  const userId = await resolveUserId(optionUserId);
  const client = await createCliUtpHttpClient({ store, userId });

  return createNotificationsService(client, userId);
}

const cli = cac("utp");
const store = createTokenStore();

cli
  .command("login", "Open the UTP login flow and save the CLI session")
  .option("--timeout <seconds>", "Seconds to wait for the browser callback", {
    default: 120,
  })
  .option("--mode <mode>", "Login mode: capture or localhost", {
    default: "capture",
  })
  .action(async (options: { timeout?: string | number; mode?: string }) => {
    try {
      const timeoutSeconds = parseTimeout(options.timeout);
      const mode = parseLoginMode(options.mode);
      console.log("Opening browser for UTP login...");
      console.log(`Login mode: ${mode}`);
      console.log(`Waiting up to ${timeoutSeconds} seconds for the login callback.`);

      const result =
        mode === "capture"
          ? await runBrowserCaptureLogin({ timeoutSeconds })
          : await runBrowserLogin({ timeoutSeconds });
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

      console.log("User id saved.");
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

cli.help();
cli.parse();
