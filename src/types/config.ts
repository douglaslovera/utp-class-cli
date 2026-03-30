export interface AuthConfig {
  refreshToken: string;
  cookieHeader: string;
  tokenUrl: string;
  clientId: string;
  redirectUri: string;
  origin: string;
  referer: string;
  userAgent: string;
  requestTimeoutMs: number;
  accessTokenLeewayMs: number;
}

export interface ApiSecurityConfig {
  bearerToken: string;
}

export interface UpstreamConfig {
  platformBaseUrl: string;
  apiBaseUrl: string;
  userId: string;
  userRole: string;
}

export interface AppConfig {
  logLevel: string;
  api: ApiSecurityConfig;
  auth: AuthConfig;
  upstream: UpstreamConfig;
}
