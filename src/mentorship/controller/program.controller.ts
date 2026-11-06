import { Hono } from "hono";
import { authenticate, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { parse, parseBody } from "../../util/validate";
import {
  createProgramGoalSchema,
  createProgramSchema,
  listProgramsQuerySchema,
  listTasksQuerySchema,
  noteSchema,
  programStatusSchema,
  progressSchema,
  taskSchema,
  taskStatusSchema,
  updateProgramGoalSchema,
} from "../dto/program.dto";
import * as service from "../service/program.service";

export const programController = new Hono<AppEnv>();

const member = requireRole("STUDENT", "MENTOR");

programController.post("/api/programs", authenticate, requireRole("STUDENT"), async (c) => {
  const body = await parseBody(c.req.raw, createProgramSchema);
  return c.json(await service.requestProgram(c.env.DB, c.get("user"), body), 201);
});

programController.get("/api/programs", authenticate, member, async (c) => {
  const query = parse(listProgramsQuerySchema, c.req.query());
  return c.json(await service.listPrograms(c.env.DB, c.get("user"), query));
});

programController.get("/api/programs/:id", authenticate, member, async (c) => {
  return c.json(await service.getProgram(c.env.DB, c.get("user"), c.req.param("id")));
});

programController.post("/api/programs/:id/accept", authenticate, requireRole("MENTOR"), async (c) => {
  return c.json(await service.accept(c.env.DB, c.get("user"), c.req.param("id")));
});

programController.post("/api/programs/:id/decline", authenticate, requireRole("MENTOR"), async (c) => {
  return c.json(await service.decline(c.env.DB, c.get("user"), c.req.param("id")));
});

programController.put("/api/programs/:id/status", authenticate, member, async (c) => {
  const body = await parseBody(c.req.raw, programStatusSchema);
  return c.json(await service.changeStatus(c.env.DB, c.get("user"), c.req.param("id"), body));
});

programController.post("/api/programs/:id/goals", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, createProgramGoalSchema);
  return c.json(await service.addGoal(c.env.DB, c.get("user"), c.req.param("id"), body), 201);
});

programController.get("/api/programs/:id/goals", authenticate, member, async (c) => {
  return c.json(await service.listGoals(c.env.DB, c.get("user"), c.req.param("id")));
});

programController.put("/api/program-goals/:id", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, updateProgramGoalSchema);
  return c.json(await service.updateGoal(c.env.DB, c.get("user"), c.req.param("id"), body));
});

programController.post("/api/program-goals/:id/tasks", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, taskSchema);
  return c.json(await service.addTask(c.env.DB, c.get("user"), c.req.param("id"), body), 201);
});

programController.get("/api/programs/:id/tasks", authenticate, member, async (c) => {
  const query = parse(listTasksQuerySchema, c.req.query());
  return c.json(await service.listTasks(c.env.DB, c.get("user"), c.req.param("id"), query));
});

programController.put("/api/tasks/:id", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, taskSchema);
  return c.json(await service.updateTask(c.env.DB, c.get("user"), c.req.param("id"), body));
});

programController.put("/api/tasks/:id/status", authenticate, member, async (c) => {
  const body = await parseBody(c.req.raw, taskStatusSchema);
  return c.json(await service.changeTaskStatus(c.env.DB, c.get("user"), c.req.param("id"), body));
});

programController.post("/api/program-goals/:id/progress", authenticate, requireRole("STUDENT"), async (c) => {
  const body = await parseBody(c.req.raw, progressSchema);
  return c.json(await service.addProgress(c.env.DB, c.get("user"), c.req.param("id"), body), 201);
});

programController.get("/api/program-goals/:id/progress", authenticate, member, async (c) => {
  return c.json(await service.listProgress(c.env.DB, c.get("user"), c.req.param("id")));
});

programController.post("/api/programs/:id/notes", authenticate, requireRole("MENTOR"), async (c) => {
  const body = await parseBody(c.req.raw, noteSchema);
  return c.json(await service.addNote(c.env.DB, c.get("user"), c.req.param("id"), body), 201);
});

programController.get("/api/programs/:id/notes", authenticate, member, async (c) => {
  return c.json(await service.listNotes(c.env.DB, c.get("user"), c.req.param("id")));
});
