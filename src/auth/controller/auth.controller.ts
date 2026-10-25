import { Hono } from "hono";
import type { AppEnv } from "../../config/env";
import { parseBody } from "../../util/validate";
import { loginSchema, registerSchema } from "../dto/auth.dto";
import * as service from "../service/auth.service";

export const authController = new Hono<AppEnv>();

authController.post("/register", async (c) => {
  const body = await parseBody(c.req.raw, registerSchema);
  return c.json(await service.register(c.env, body), 201);
});

authController.post("/login", async (c) => {
  const body = await parseBody(c.req.raw, loginSchema);
  return c.json(await service.login(c.env, body), 200);
});
