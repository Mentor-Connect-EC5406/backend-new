import { Hono } from "hono";
import { authenticate, authenticateOptional, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { pageQuerySchema } from "../../util/pagination";
import { parse, parseBody } from "../../util/validate";
import { searchMentorsQuerySchema, upsertMentorSchema } from "../dto/mentor.dto";
import * as service from "../service/mentor.service";
import { expertiseController } from "./expertise.controller";
import { slotController } from "./slot.controller";
import { verificationController } from "./verification.controller";

export const mentorController = new Hono<AppEnv>();

mentorController.get("/api/mentors/me", authenticate, requireRole("MENTOR"), async (c) => {
  return c.json(await service.getMyProfile(c.env.DB, c.get("user")));
});

mentorController.put("/api/mentors/me", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, upsertMentorSchema);
  const { mentor, created } = await service.upsertMyProfile(c.env.DB, c.get("user"), body);
  return c.json(mentor, created ? 201 : 200);
});

mentorController.get("/api/mentors", async (c) => {
  const query = parse(searchMentorsQuerySchema, { ...c.req.query(), industries: c.req.queries("industries") });
  return c.json(await service.search(c.env.DB, query));
});

mentorController.get("/api/students/me/saved-mentors", authenticate, requireRole("STUDENT"), async (c) => {
  const query = parse(pageQuerySchema, c.req.query());
  return c.json(await service.listSaved(c.env.DB, c.get("user"), query));
});

mentorController.put("/api/students/me/saved-mentors/:id", authenticate, requireRole("STUDENT"), async (c) => {
  await service.saveMentor(c.env.DB, c.get("user"), c.req.param("id"));
  return c.body(null, 204);
});

mentorController.delete("/api/students/me/saved-mentors/:id", authenticate, requireRole("STUDENT"), async (c) => {
  await service.unsaveMentor(c.env.DB, c.get("user"), c.req.param("id"));
  return c.body(null, 204);
});

// /api/mentors/me/* routes are registered before /api/mentors/:id
mentorController.route("/", expertiseController);
mentorController.route("/", slotController);
mentorController.route("/", verificationController);

mentorController.get("/api/mentors/:id", authenticateOptional, async (c) => {
  return c.json(await service.getById(c.env.DB, c.get("user"), c.req.param("id")));
});
