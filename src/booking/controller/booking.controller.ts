import { Hono } from "hono";
import type { AppEnv } from "../../config/env";

export const bookingController = new Hono<AppEnv>();
