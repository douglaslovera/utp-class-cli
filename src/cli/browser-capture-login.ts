import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { UTP_AUTH } from "./auth-constants";
import { createPkcePair, createState } from "./pkce";
import { exchangeAuthorizationCode, type LoginOptions, type LoginResult } from "./oidc-login";

const CHROME_CHANNELS = ["chrome", "chrome-beta", "chrome-dev", "msedge"] as const;

export interface HeadlessCredentials {
  username: string;
  password: string;
}

export function formatAuthenticationError(message: string): string {
  const normalized = message.replace(/\s+/g, " ").trim();

  if (
    /invalid username or password|incorrect (user|username|password)|usuario.*contrase(?:ñ|n)a|credenciales (inv[aá]lidas|incorrectas)/i
      .test(normalized)
  ) {
    return "Incorrect user or password.";
  }

  return normalized ? `UTP login failed: ${normalized}` : "UTP login failed.";
}

function buildAuthorizationUrl(state: string, challenge: string): string {
  const authorizationUrl = new URL(UTP_AUTH.authorizationUrl);
  authorizationUrl.searchParams.set("client_id", UTP_AUTH.clientId);
  authorizationUrl.searchParams.set("redirect_uri", UTP_AUTH.classRedirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", UTP_AUTH.scope);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return authorizationUrl.toString();
}

interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
}

async function launchChrome(headless: boolean): Promise<BrowserSession> {
  let lastError: unknown;

  for (const channel of CHROME_CHANNELS) {
    try {
      const browser = await chromium.launch({
        channel,
        headless,
      });

      const context = await browser.newContext();

      return { browser, context };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    "Could not launch Chrome or Edge through Playwright. Install Google Chrome, or use the localhost login mode if UTP allows it.",
    { cause: lastError },
  );
}

async function fillHeadlessCredentials(
  page: Page,
  credentials: HeadlessCredentials,
): Promise<void> {
  const usernameField = page
    .locator(
      [
        "input[name='username']",
        "input#username",
        "input[type='email']",
        "input[autocomplete='username']",
        "input[name='email']",
      ].join(", "),
    )
    .first();
  const passwordField = page
    .locator(
      [
        "input[name='password']",
        "input#password",
        "input[type='password']",
        "input[autocomplete='current-password']",
      ].join(", "),
    )
    .first();

  await usernameField.waitFor({ state: "visible", timeout: 30_000 });
  await usernameField.fill(credentials.username);
  await passwordField.fill(credentials.password);

  const submitButton = page
    .locator(
      [
        "button[type='submit']",
        "input[type='submit']",
        "button:has-text('Iniciar')",
        "button:has-text('Ingresar')",
        "button:has-text('Login')",
        "button:has-text('Sign in')",
      ].join(", "),
    )
    .first();

  if (await submitButton.count()) {
    await submitButton.click();
    return;
  }

  await passwordField.press("Enter");
}

function waitForRedirectCode(
  context: BrowserContext,
  page: Page,
  expectedState: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    const inspectUrl = (rawUrl: string): string | null => {
      const url = new URL(rawUrl);

      if (url.origin + url.pathname !== UTP_AUTH.classRedirectUri) {
        return null;
      }

      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");

      if (error) {
        settle(() => reject(new Error(errorDescription ?? error)));
        return null;
      }

      if (state !== expectedState) {
        settle(() => reject(new Error("Login state did not match")));
        return null;
      }

      if (!code) {
        return null;
      }

      settle(() => resolve(code));
      return code;
    };

    context
      .route(`${UTP_AUTH.classRedirectUri}**`, async (route) => {
        const code = inspectUrl(route.request().url());

        if (code) {
          await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            body:
              "<!doctype html><html><body><h1>Login captured</h1><p>You can return to the terminal.</p></body></html>",
          });
          return;
        }

        await route.continue();
      })
      .catch((error: unknown) => settle(() => reject(error as Error)));

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        inspectUrl(frame.url());
      }
    });
  });
}

async function waitForAuthenticationError(page: Page): Promise<never> {
  const errorMessage = await page.waitForFunction(() => {
    const selectors = [
      "#input-error",
      "#kc-error-message",
      ".kc-feedback-text",
      ".alert-error",
      ".pf-c-alert__title",
      ".pf-v5-c-alert__title",
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        const style = window.getComputedStyle(element);
        const message = element.innerText?.replace(/\s+/g, " ").trim();

        if (
          message
          && style.display !== "none"
          && style.visibility !== "hidden"
          && element.getClientRects().length > 0
        ) {
          return message;
        }
      }
    }

    return false;
  }, undefined, { timeout: 0 });

  const message = await errorMessage.jsonValue();
  throw new Error(formatAuthenticationError(typeof message === "string" ? message : ""));
}

export async function runBrowserCaptureLogin(options: LoginOptions): Promise<LoginResult> {
  return runManagedBrowserLogin(options, {
    headless: false,
  });
}

export async function runHeadlessLogin(
  options: LoginOptions,
  credentials: HeadlessCredentials,
): Promise<LoginResult> {
  return runManagedBrowserLogin(options, {
    headless: true,
    credentials,
  });
}

async function runManagedBrowserLogin(
  options: LoginOptions,
  browserOptions: {
    headless: boolean;
    credentials?: HeadlessCredentials;
  },
): Promise<LoginResult> {
  const state = createState();
  const pkce = createPkcePair();
  const authorizationUrl = buildAuthorizationUrl(state, pkce.challenge);
  const browserSession = await launchChrome(browserOptions.headless);
  const { browser, context } = browserSession;
  const page = await context.newPage();
  const timeoutMs = options.timeoutSeconds * 1000;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    const codePromise = waitForRedirectCode(context, page, state);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Login timed out after ${options.timeoutSeconds} seconds`));
      }, timeoutMs);
    });

    await page.goto(authorizationUrl);
    if (browserOptions.credentials) {
      const authenticationErrorPromise = waitForAuthenticationError(page);
      await fillHeadlessCredentials(page, browserOptions.credentials);
      const code = await Promise.race([
        codePromise,
        authenticationErrorPromise,
        timeoutPromise,
      ]);
      const session = await exchangeAuthorizationCode(
        code,
        UTP_AUTH.classRedirectUri,
        pkce.verifier,
        options.fetchImpl,
      );

      return { session };
    }

    const code = await Promise.race([codePromise, timeoutPromise]);
    const session = await exchangeAuthorizationCode(
      code,
      UTP_AUTH.classRedirectUri,
      pkce.verifier,
      options.fetchImpl,
    );

    return { session };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }

    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
