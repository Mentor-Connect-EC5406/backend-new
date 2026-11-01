import { Hono } from "hono";
import { authenticate, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { pageQuerySchema } from "../../util/pagination";
import { parse, parseBody } from "../../util/validate";
import { createGoalSchema, updateGoalSchema } from "../dto/goal.dto";
import * as service from "../service/goal.service";

export const goalController = new Hono<AppEnv>();

goalController.get("/api/goals", authenticate, requireRole("STUDENT"), async (c) => {
  const query = parse(pageQuerySchema, c.req.query());
  return c.json(await service.listGoals(c.env.DB, c.get("user"), query));
});

goalController.post("/api/goals", authenticate, requireRole("STUDENT"), async (c) => {
  const body = await parseBody(c.req.raw, createGoalSchema);
  return c.json(await service.createGoal(c.env.DB, c.get("user"), body), 201);
});

goalController.patch("/api/goals/:id", authenticate, requireRole("STUDENT"), async (c) => {
  const body = await parseBody(c.req.raw, updateGoalSchema);
  return c.json(await service.updateGoal(c.env.DB, c.get("user"), c.req.param("id"), body));
});

goalController.delete("/api/goals/:id", authenticate, requireRole("STUDENT"), async (c) => {
  await service.deleteGoal(c.env.DB, c.get("user"), c.req.param("id"));
  return c.body(null, 204);
});
