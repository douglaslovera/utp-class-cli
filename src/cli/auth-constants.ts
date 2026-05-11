export const UTP_AUTH = {
  authorizationUrl:
    "https://sso.utp.edu.pe/auth/realms/Xpedition/protocol/openid-connect/auth",
  tokenUrl:
    "https://sso.utp.edu.pe/auth/realms/Xpedition/protocol/openid-connect/token",
  clientId: "pao-web",
  scope: "openid profile email",
  classRedirectUri: "https://class.utp.edu.pe/student/courses",
} as const;
