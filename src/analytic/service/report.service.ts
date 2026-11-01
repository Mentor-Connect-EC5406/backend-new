import type { CurrentUser } from "../../config/current-user";
import { badRequest, conflict, notFound } from "../../exception/api-error";
import { offsetOf, toPage, type Page, type PageQuery } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type {
  AdminStatsResponse,
  CreateReportRequest,
  ListReportsQuery,
  ReportResponse,
  UpdateReportRequest,
} from "../dto/report.dto";
import type { ReportDetailRow } from "../entity/report.entity";
import * as repo from "../repository/report.repository";

const toResponse = (r: ReportDetailRow): ReportResponse => ({
  id: r.id,
  reportedBy: r.reported_by,
  reporterName: r.reporter_name,
  reportedUserId: r.reported_user_id,
  reportedUserName: r.reported_user_name,
  bookingId: r.booking_id,
  category: r.category,
  description: r.description,
  status: r.status,
  assignedAdminId: r.assigned_admin_id,
  resolution: r.resolution,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
});

export async function createReport(db: D1Database, me: CurrentUser, req: CreateReportRequest): Promise<ReportResponse> {
  const reportedUserId = req.reportedUserId ?? null;
  const bookingId = req.bookingId ?? null;
  if (reportedUserId === me.id) {
    throw badRequest("Validation failed", [{ field: "reportedUserId", message: "must not be yourself" }]);
  }
  if (reportedUserId && !(await repo.userExists(db, reportedUserId))) throw notFound("User not found");
  // only a party of the booking can point at it
  if (bookingId && !(await repo.isBookingParty(db, bookingId, me.id))) throw notFound("Booking not found");

  const id = newId();
  await repo.insert(db, {
    id,
    reported_by: me.id,
    reported_user_id: reportedUserId,
    booking_id: bookingId,
    category: req.category,
    description: req.description,
    created_at: nowIso(),
  });
  return toResponse((await repo.findDetail(db, id))!);
}

export async function listMine(db: D1Database, me: CurrentUser, q: PageQuery): Promise<Page<ReportResponse>> {
  const { rows, total } = await repo.listByReporter(db, me.id, q.size, offsetOf(q));
  return toPage(rows.map(toResponse), q, total);
}

export async function listReports(db: D1Database, q: ListReportsQuery): Promise<Page<ReportResponse>> {
  const { rows, total } = await repo.listAll(db, q.status, q.size, offsetOf(q));
  return toPage(rows.map(toResponse), q, total);
}

export async function getReport(db: D1Database, id: string): Promise<ReportResponse> {
  const row = await repo.findDetail(db, id);
  if (!row) throw notFound("Report not found");
  return toResponse(row);
}

export async function updateReport(
  db: D1Database,
  me: CurrentUser,
  id: string,
  req: UpdateReportRequest,
): Promise<ReportResponse> {
  const report = await repo.findDetail(db, id);
  if (!report) throw notFound("Report not found");

  const assignedAdminId = req.assignedAdminId ?? me.id;
  if (!(await repo.isAdmin(db, assignedAdminId))) {
    throw badRequest("Validation failed", [{ field: "assignedAdminId", message: "must be an admin" }]);
  }
  const now = nowIso();
  const updated = await repo.updateOpen(db, {
    id,
    status: req.status,
    assignedAdminId,
    resolution: req.resolution ?? null,
    resolvedAt: req.status === "UNDER_REVIEW" ? null : now,
    now,
  });
  if (!updated) throw conflict("Report is already closed");
  return toResponse((await repo.findDetail(db, id))!);
}

export async function getAdminStats(db: D1Database): Promise<AdminStatsResponse> {
  const row = (await repo.adminStats(db))!;
  return { users: row.users, mentors: row.mentors, bookings: row.bookings, revenueCents: row.revenue_cents, currency: "LKR" };
}
