import { Hono } from "hono";
import { authenticate, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { parse, parseBody } from "../../util/validate";
import {
  listVerificationsQuerySchema,
  reviewVerificationSchema,
  submitVerificationSchema,
} from "../dto/mentor.dto";
import * as service from "../service/verification.service";

export const verificationController = new Hono<AppEnv>();

verificationController.post("/api/mentors/me/verifications", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, submitVerificationSchema);
  return c.json(await service.submit(c.env.DB, c.get("user"), body), 201);
});

verificationController.get("/api/mentors/me/verifications", authenticate, requireRole("MENTOR"), async (c) => {
  return c.json(await service.listMine(c.env.DB, c.get("user")));
});

verificationController.get("/api/verifications", authenticate, requireRole("ADMIN"), async (c) => {
  const query = parse(listVerificationsQuerySchema, c.req.query());
  return c.json(await service.listAll(c.env.DB, query));
});

verificationController.put("/api/verifications/:id", authenticate, requireRole("ADMIN"), async (c) => {
  const body = await parseBody(c.req.raw, reviewVerificationSchema);
  return c.json(await service.review(c.env.DB, c.get("user"), c.req.param("id"), body));
});
