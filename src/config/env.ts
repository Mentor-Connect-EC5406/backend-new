import type { CurrentUser } from "./current-user";

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ALLOWED_ORIGINS: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: { user: CurrentUser };
};
