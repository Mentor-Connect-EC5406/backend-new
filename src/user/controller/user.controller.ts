import { Hono } from "hono";
import { authenticate, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { parse, parseBody } from "../../util/validate";
import { listUsersQuerySchema, updateMeSchema, updateStatusSchema } from "../dto/user.dto";
import * as service from "../service/user.service";

export const userController = new Hono<AppEnv>();

userController.get("/api/users/me", authenticate, async (c) => {
  return c.json(await service.getMe(c.env.DB, c.get("user")));
});

userController.put("/api/users/me", authenticate, async (c) => {
  const body = await parseBody(c.req.raw, updateMeSchema);
  return c.json(await service.updateMe(c.env.DB, c.get("user"), body));
});

userController.get("/api/users", authenticate, requireRole("ADMIN"), async (c) => {
  const query = parse(listUsersQuerySchema, c.req.query());
  return c.json(await service.listUsers(c.env.DB, query));
});

userController.put("/api/users/:id/status", authenticate, requireRole("ADMIN"), async (c) => {
  const body = await parseBody(c.req.raw, updateStatusSchema);
  return c.json(await service.updateStatus(c.env.DB, c.get("user"), c.req.param("id"), body.accountStatus));
});
