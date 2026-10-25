import { Hono } from "hono";
import type { AppEnv } from "../../config/env";

export const userController = new Hono<AppEnv>();
