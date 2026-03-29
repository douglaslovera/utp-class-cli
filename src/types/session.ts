export interface SessionSnapshot {
  configured: boolean;
  hasAccessToken: boolean;
  accessTokenExpiresAt: string | null;
  accessTokenExpiresInMs: number | null;
  hasRuntimeRefreshTokenOverride: boolean;
  refreshInFlight: boolean;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type?: string;
}
