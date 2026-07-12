import { describe, expect, test } from "bun:test";
import { formatAuthenticationError } from "../cli/browser-capture-login";

describe("headless login errors", () => {
  test("normalizes invalid credentials without exposing upstream markup", () => {
    expect(formatAuthenticationError("Invalid username or password.")).toBe(
      "Incorrect user or password.",
    );
    expect(formatAuthenticationError("Usuario o contraseña incorrectos")).toBe(
      "Incorrect user or password.",
    );
  });

  test("preserves other useful authentication errors", () => {
    expect(formatAuthenticationError("Account temporarily disabled")).toBe(
      "UTP login failed: Account temporarily disabled",
    );
  });
});
