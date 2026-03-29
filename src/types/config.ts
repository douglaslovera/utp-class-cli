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

export interface UpstreamConfig {
  platformBaseUrl: string;
  apiBaseUrl: string;
  userId: string;
  userRole: string;
}

export interface AppConfig {
  logLevel: string;
  auth: AuthConfig;
  upstream: UpstreamConfig;
}
