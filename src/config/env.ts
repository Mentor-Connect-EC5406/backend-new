import type { CurrentUser } from "./current-user";

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ALLOWED_ORIGINS: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: { user: CurrentUser };
};
