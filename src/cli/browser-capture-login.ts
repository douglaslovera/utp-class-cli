import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { UTP_AUTH } from "./auth-constants";
import { createPkcePair, createState } from "./pkce";
import { exchangeAuthorizationCode, type LoginOptions, type LoginResult } from "./oidc-login";

const CHROME_CHANNELS = ["chrome", "chrome-beta", "chrome-dev", "msedge"] as const;

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

async function launchChrome(): Promise<BrowserSession> {
  let lastError: unknown;

  for (const channel of CHROME_CHANNELS) {
    try {
      const browser = await chromium.launch({
        channel,
        headless: false,
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

export async function runBrowserCaptureLogin(options: LoginOptions): Promise<LoginResult> {
  const state = createState();
  const pkce = createPkcePair();
  const authorizationUrl = buildAuthorizationUrl(state, pkce.challenge);
  const browserSession = await launchChrome();
  const { browser, context } = browserSession;
  const page = await context.newPage();
  const timeoutMs = options.timeoutSeconds * 1000;

  try {
    const codePromise = waitForRedirectCode(context, page, state);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Login timed out after ${options.timeoutSeconds} seconds`)),
        timeoutMs,
      );
    });

    await page.goto(authorizationUrl);
    const code = await Promise.race([codePromise, timeoutPromise]);
    const session = await exchangeAuthorizationCode(
      code,
      UTP_AUTH.classRedirectUri,
      pkce.verifier,
      options.fetchImpl,
    );

    return { session };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
