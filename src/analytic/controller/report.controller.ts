import { Hono } from "hono";
import { authenticate, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { pageQuerySchema } from "../../util/pagination";
import { parse, parseBody } from "../../util/validate";
import { createReportSchema, listReportsQuerySchema, updateReportSchema } from "../dto/report.dto";
import * as service from "../service/report.service";

export const reportController = new Hono<AppEnv>();

reportController.post("/api/reports", authenticate, async (c) => {
  const body = await parseBody(c.req.raw, createReportSchema);
  return c.json(await service.createReport(c.env.DB, c.get("user"), body), 201);
});

reportController.get("/api/reports/mine", authenticate, async (c) => {
  const query = parse(pageQuerySchema, c.req.query());
  return c.json(await service.listMine(c.env.DB, c.get("user"), query));
});

reportController.get("/api/reports", authenticate, requireRole("ADMIN"), async (c) => {
  const query = parse(listReportsQuerySchema, c.req.query());
  return c.json(await service.listReports(c.env.DB, query));
});

reportController.get("/api/reports/:id", authenticate, requireRole("ADMIN"), async (c) => {
  return c.json(await service.getReport(c.env.DB, c.req.param("id")));
});

reportController.put("/api/reports/:id", authenticate, requireRole("ADMIN"), async (c) => {
  const body = await parseBody(c.req.raw, updateReportSchema);
  return c.json(await service.updateReport(c.env.DB, c.get("user"), c.req.param("id"), body));
});

reportController.get("/api/admin/stats", authenticate, requireRole("ADMIN"), async (c) => {
  return c.json(await service.getAdminStats(c.env.DB));
});
