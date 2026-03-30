export interface WorkerBindings {
  API_BEARER_TOKEN: string;
  UTP_REFRESH_TOKEN: string;
  UTP_COOKIE_HEADER: string;
  UTP_USER_ID: string;
  LOG_LEVEL?: string;
}

export interface AppEnv {
  Bindings: WorkerBindings;
}
