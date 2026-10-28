import { Hono } from "hono";
import { authenticate, authenticateIdentity, authenticateMe, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { parse, parseBody } from "../../util/validate";
import {
  avatarUploadUrlSchema,
  listUsersQuerySchema,
  registerUserSchema,
  updateMeSchema,
  updateStatusSchema,
  updateStudentProfileSchema,
} from "../dto/user.dto";
import * as profiles from "../service/student-profile.service";
import * as service from "../service/user.service";

export const userController = new Hono<AppEnv>();

userController.post("/api/users/register", authenticateIdentity, async (c) => {
  const body = await parseBody(c.req.raw, registerUserSchema);
  return c.json(await service.register(c.env, c.get("identity"), body), 201);
});

userController.get("/api/users/me", authenticateMe, async (c) => {
  return c.json(await service.getMe(c.env.DB, c.get("user")));
});

userController.put("/api/users/me", authenticate, async (c) => {
  const body = await parseBody(c.req.raw, updateMeSchema);
  return c.json(await service.updateMe(c.env, c.get("user"), body));
});

userController.get("/api/users", authenticate, requireRole("ADMIN"), async (c) => {
  const query = parse(listUsersQuerySchema, c.req.query());
  return c.json(await service.listUsers(c.env.DB, query));
});

userController.put("/api/users/:id/status", authenticate, requireRole("ADMIN"), async (c) => {
  const body = await parseBody(c.req.raw, updateStatusSchema);
  return c.json(await service.updateStatus(c.env.DB, c.get("user"), c.req.param("id"), body.accountStatus));
});

userController.post("/api/users/me/avatar-upload-url", authenticate, async (c) => {
  const body = await parseBody(c.req.raw, avatarUploadUrlSchema);
  return c.json(await service.avatarUploadUrl(c.env, c.get("user"), body));
});

userController.get("/api/students/me/profile", authenticate, requireRole("STUDENT"), async (c) => {
  return c.json(await profiles.getProfile(c.env.DB, c.get("user")));
});

userController.put("/api/students/me/profile", authenticate, requireRole("STUDENT"), async (c) => {
  const body = await parseBody(c.req.raw, updateStudentProfileSchema);
  return c.json(await profiles.updateProfile(c.env.DB, c.get("user"), body));
});
