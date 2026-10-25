import { Hono } from "hono";
import { authenticate, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { parseBody } from "../../util/validate";
import { createCategorySchema, createExpertiseSchema, replaceExpertisesSchema } from "../dto/mentor.dto";
import * as service from "../service/expertise.service";

export const expertiseController = new Hono<AppEnv>();

expertiseController.get("/api/expertise-categories", authenticate, async (c) => {
  return c.json(await service.listCategories(c.env.DB));
});

expertiseController.post("/api/expertise-categories", authenticate, requireRole("ADMIN"), async (c) => {
  const body = await parseBody(c.req.raw, createCategorySchema);
  return c.json(await service.createCategory(c.env.DB, body), 201);
});

expertiseController.post("/api/expertise-categories/:id/expertises", authenticate, requireRole("ADMIN"), async (c) => {
  const body = await parseBody(c.req.raw, createExpertiseSchema);
  return c.json(await service.createExpertise(c.env.DB, c.req.param("id"), body), 201);
});

expertiseController.put("/api/mentors/me/expertises", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, replaceExpertisesSchema);
  return c.json(await service.replaceMyExpertises(c.env.DB, c.get("user"), body));
});
