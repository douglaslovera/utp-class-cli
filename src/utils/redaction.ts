import type { SessionSnapshot } from "../types/session";

export function redactSecret(secret?: string | null): string | null {
  if (!secret) {
    return null;
  }

  if (secret.length <= 8) {
    return "[REDACTED]";
  }

  return `${secret.slice(0, 4)}...[REDACTED]...${secret.slice(-4)}`;
}

export function sanitizeSessionSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return { ...snapshot };
}
