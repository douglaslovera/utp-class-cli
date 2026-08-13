interface IdTokenClaims {
  preferred_username?: unknown;
  username?: unknown;
  user_id?: unknown;
  userId?: unknown;
}

function readStringClaim(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Reads the student identifier exposed by the UTP identity provider.
 *
 * The token has already been received from the configured token endpoint;
 * this helper only reads the non-sensitive username claims and does not use
 * the decoded payload for authentication or authorization.
 */
export function readUserIdFromIdToken(idToken: string | null): string | null {
  if (!idToken) {
    return null;
  }

  const [, encodedPayload] = idToken.split(".");

  if (!encodedPayload) {
    return null;
  }

  try {
    const claims = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as IdTokenClaims;

    for (const value of [
      claims.preferred_username,
      claims.username,
      claims.user_id,
      claims.userId,
    ]) {
      const userId = readStringClaim(value);

      if (userId) {
        return userId;
      }
    }
  } catch {
    // A malformed or non-JWT ID token simply means manual configuration is needed.
  }

  return null;
}
