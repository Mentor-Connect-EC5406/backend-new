import { Hono } from "hono";
import type { AppEnv } from "../../config/env";

export const notificationController = new Hono<AppEnv>();
