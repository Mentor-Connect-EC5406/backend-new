import type { CurrentUser, Identity } from "./current-user";

export type Env = {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  ASGARDEO_ISSUER: string;
  ASGARDEO_JWKS_URL: string;
  ASGARDEO_CLIENT_ID: string;
  // "true" only in .dev.vars: enables /api/auth/register, /api/auth/login and HS256 tokens
  PASSWORD_LOGIN?: string;
  JWT_SECRET?: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
};

export const passwordLoginEnabled = (env: Env) => env.PASSWORD_LOGIN === "true" && !!env.JWT_SECRET;

export type AppEnv = {
  Bindings: Env;
  Variables: { user: CurrentUser; identity: Identity };
};
