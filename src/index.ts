import { buildApp } from "./app";
import { loadConfig } from "./config/env";
import type { WorkerBindings } from "./types/runtime";

interface WorkerAppCache {
  cacheKey: string;
  app: ReturnType<typeof buildApp>;
}

let appCache: WorkerAppCache | null = null;

function createCacheKey(env: WorkerBindings): string {
  return JSON.stringify({
    bearerToken: env.API_BEARER_TOKEN,
    refreshToken: env.UTP_REFRESH_TOKEN,
    cookieHeader: env.UTP_COOKIE_HEADER,
    userId: env.UTP_USER_ID,
    logLevel: env.LOG_LEVEL ?? "info",
  });
}

function getApp(env: WorkerBindings) {
  const cacheKey = createCacheKey(env);

  if (!appCache || appCache.cacheKey !== cacheKey) {
    appCache = {
      cacheKey,
      app: buildApp(loadConfig(env)),
    };
  }

  return appCache.app;
}

export default {
  fetch(request: Request, env: WorkerBindings, executionContext: ExecutionContext) {
    return getApp(env).fetch(request, env, executionContext);
  },
};
