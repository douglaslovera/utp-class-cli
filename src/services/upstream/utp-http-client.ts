import type { AppConfig } from "../../types/config";
import type { SessionService } from "../auth/session-service";
import { UpstreamError } from "../../utils/errors";
import { readTextSafely, withTimeout } from "../../utils/http";

interface UtpHttpClientOptions {
  config: AppConfig;
  sessionService: SessionService;
  fetchImpl?: typeof fetch;
}

interface UtpRequestOptions {
  baseUrl?: string;
  includePlatformHeaders?: boolean;
}

export interface UtpHttpClient {
  request(
    path: string,
    init?: RequestInit,
    options?: UtpRequestOptions,
  ): Promise<Response>;
  requestJson<T>(
    path: string,
    init?: RequestInit,
    options?: UtpRequestOptions,
  ): Promise<T>;
  requestApiJson<T>(path: string, init?: RequestInit): Promise<T>;
}

function createFetchClient(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) {
    return fetchImpl;
  }

  return globalThis.fetch.bind(globalThis);
}

export function createUtpHttpClient({
  config,
  sessionService,
  fetchImpl,
}: UtpHttpClientOptions): UtpHttpClient {
  const request = createFetchClient(fetchImpl);

  const resolveUrl = (path: string, baseUrl?: string): string =>
    new URL(path, baseUrl ?? config.upstream.platformBaseUrl).toString();

  const execute = async (
    path: string,
    init: RequestInit,
    allowAuthRetry: boolean,
    options: UtpRequestOptions,
  ): Promise<Response> => {
    const token = await sessionService.getValidAccessToken(!allowAuthRetry);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);

    if (options.includePlatformHeaders) {
      headers.set("origin", config.auth.origin);
      headers.set("referer", config.auth.referer);
      headers.set("user-agent", config.auth.userAgent);
      headers.set("user-id", config.upstream.userId);
      headers.set("user-role", config.upstream.userRole);
    }

    const { signal, cleanup } = withTimeout(config.auth.requestTimeoutMs);

    try {
      const response = await request(resolveUrl(path, options.baseUrl), {
        ...init,
        headers,
        signal,
      });

      if (response.status === 401 && allowAuthRetry) {
        sessionService.markAccessTokenExpired();
        await sessionService.getValidAccessToken(true);
        return execute(path, init, false, options);
      }

      if (!response.ok) {
        const body = await readTextSafely(response);
        throw new UpstreamError("UTP upstream request failed", {
          details: {
            status: response.status,
            bodySnippet: body.slice(0, 300),
          },
        });
      }

      return response;
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw error;
      }

      throw new UpstreamError("Failed to reach UTP upstream", {
        cause: error,
      });
    } finally {
      cleanup();
    }
  };

  return {
    request(path, init: RequestInit = {}, options: UtpRequestOptions = {}) {
      return execute(path, init, true, options);
    },
    async requestJson<T>(
      path: string,
      init: RequestInit = {},
      options: UtpRequestOptions = {},
    ): Promise<T> {
      const response = await execute(path, init, true, options);
      return (await response.json()) as T;
    },
    requestApiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
      return execute(path, init, true, {
        baseUrl: config.upstream.apiBaseUrl,
        includePlatformHeaders: true,
      }).then((response) => response.json() as Promise<T>);
    },
  };
}
