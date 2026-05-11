import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

export interface StoredSession {
  refreshToken: string;
  refreshTokenExpiresAt: string | null;
  idToken: string | null;
  tokenType: string;
  updatedAt: string;
  userId: string | null;
}

export interface TokenStore {
  path: string;
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

function resolveConfigDir(): string {
  if (process.env.UTP_CLASS_CLI_CONFIG_DIR) {
    return process.env.UTP_CLASS_CLI_CONFIG_DIR;
  }

  if (platform() === "win32") {
    return join(process.env.APPDATA ?? homedir(), "utp-class-cli");
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "utp-class-cli");
}

export function createTokenStore(): TokenStore {
  const path = join(resolveConfigDir(), "session.json");

  return {
    path,
    async load(): Promise<StoredSession | null> {
      try {
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw) as Partial<StoredSession>;

        if (typeof parsed.refreshToken !== "string" || !parsed.refreshToken) {
          return null;
        }

        return {
          refreshToken: parsed.refreshToken,
          refreshTokenExpiresAt:
            typeof parsed.refreshTokenExpiresAt === "string"
              ? parsed.refreshTokenExpiresAt
              : null,
          idToken: typeof parsed.idToken === "string" ? parsed.idToken : null,
          tokenType: typeof parsed.tokenType === "string" ? parsed.tokenType : "Bearer",
          updatedAt:
            typeof parsed.updatedAt === "string"
              ? parsed.updatedAt
              : new Date(0).toISOString(),
          userId: typeof parsed.userId === "string" ? parsed.userId : null,
        };
      } catch (error) {
        if (
          error
          && typeof error === "object"
          && "code" in error
          && error.code === "ENOENT"
        ) {
          return null;
        }

        throw error;
      }
    },
    async save(session: StoredSession): Promise<void> {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, `${JSON.stringify(session, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    },
    async clear(): Promise<void> {
      await rm(path, { force: true });
    },
  };
}
