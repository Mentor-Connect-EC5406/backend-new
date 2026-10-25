import { Hono } from "hono";
import type { AppEnv } from "../../config/env";

export const mentorController = new Hono<AppEnv>();
