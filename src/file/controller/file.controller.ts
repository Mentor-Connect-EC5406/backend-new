import { Hono } from "hono";
import { authenticate } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import * as service from "../service/file.service";

export const fileController = new Hono<AppEnv>();

const PREFIX = "/api/files/";

// avatars load in <img> tags, so they need no token
fileController.get("/api/files/avatars/*", async (c) => {
  return service.serveFile(c.env, null, c.req.path.slice(PREFIX.length));
});

fileController.get("/api/files/*", authenticate, async (c) => {
  return service.serveFile(c.env, c.get("user"), c.req.path.slice(PREFIX.length));
});
