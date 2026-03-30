import { describe, expect, test } from "bun:test";
import { loadConfig } from "../config/env";
import { ConfigError } from "../utils/errors";

const baseEnv = {
  API_BEARER_TOKEN: "api-token",
  UTP_REFRESH_TOKEN: "refresh-token",
  UTP_COOKIE_HEADER: "SESSION=abc",
  UTP_USER_ID: "123456",
};

describe("loadConfig", () => {
  test("throws when required env keys are missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  test("applies defaults for optional values", () => {
    const config = loadConfig(baseEnv);

    expect(config.logLevel).toBe("info");
    expect(config.api.bearerToken).toBe("api-token");
    expect(config.auth.clientId).toBe("pao-web");
    expect(config.upstream.platformBaseUrl).toBe("https://class.utp.edu.pe");
    expect(config.upstream.apiBaseUrl).toBe("https://api-pao.utpxpedition.com");
    expect(config.upstream.userId).toBe("123456");
    expect(config.upstream.userRole).toBe("STUDENT");
  });

  test("throws when numeric env values are invalid", () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        UTP_REQUEST_TIMEOUT_MS: "abc",
      }),
    ).toThrow("Environment variable UTP_REQUEST_TIMEOUT_MS must be a positive number");
  });
});
