import { Hono } from "hono";
import { authenticate, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { parse, parseBody } from "../../util/validate";
import { createSlotSchema, mySlotsQuerySchema, publicSlotsQuerySchema, updateSlotSchema } from "../dto/mentor.dto";
import * as service from "../service/slot.service";

export const slotController = new Hono<AppEnv>();

slotController.post("/api/mentors/me/slots", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, createSlotSchema);
  return c.json(await service.createSlot(c.env.DB, c.get("user"), body), 201);
});

slotController.get("/api/mentors/me/slots", authenticate, requireRole("MENTOR"), async (c) => {
  const query = parse(mySlotsQuerySchema, c.req.query());
  return c.json(await service.listMySlots(c.env.DB, c.get("user"), query));
});

slotController.put("/api/mentors/me/slots/:slotId", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, updateSlotSchema);
  return c.json(await service.updateSlot(c.env.DB, c.get("user"), c.req.param("slotId"), body));
});

slotController.delete("/api/mentors/me/slots/:slotId", authenticate, requireRole("MENTOR"), async (c) => {
  await service.deleteSlot(c.env.DB, c.get("user"), c.req.param("slotId"));
  return c.body(null, 204);
});

slotController.get("/api/mentors/:id/slots", authenticate, requireRole("STUDENT"), async (c) => {
  const query = parse(publicSlotsQuerySchema, c.req.query());
  return c.json(await service.listPublicSlots(c.env.DB, c.req.param("id"), query));
});
