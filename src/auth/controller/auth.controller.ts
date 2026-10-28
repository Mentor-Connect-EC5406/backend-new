import { Hono } from "hono";
import { type AppEnv, passwordLoginEnabled } from "../../config/env";
import { notFound } from "../../exception/api-error";
import { parseBody } from "../../util/validate";
import { loginSchema, registerSchema } from "../dto/auth.dto";
import * as service from "../service/auth.service";

export const authController = new Hono<AppEnv>();

// password login is for local testing; in production Asgardeo handles login
authController.use("*", async (c, next) => {
  if (!passwordLoginEnabled(c.env)) throw notFound("Route not found");
  await next();
});

authController.post("/register", async (c) => {
  const body = await parseBody(c.req.raw, registerSchema);
  return c.json(await service.register(c.env, body), 201);
});

authController.post("/login", async (c) => {
  const body = await parseBody(c.req.raw, loginSchema);
  return c.json(await service.login(c.env, body), 200);
});
