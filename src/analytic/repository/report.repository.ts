import type { AdminStatsRow, ReportDetailRow, ReportRow, ReportStatus } from "../entity/report.entity";

const DETAIL_SQL = `SELECT r.*,
    ru.first_name || ' ' || ru.last_name AS reporter_name,
    tu.first_name || ' ' || tu.last_name AS reported_user_name
  FROM reports r
  LEFT JOIN users ru ON ru.id = r.reported_by
  LEFT JOIN users tu ON tu.id = r.reported_user_id`;

export const findDetail = (db: D1Database, id: string) =>
  db.prepare(`${DETAIL_SQL} WHERE r.id = ?`).bind(id).first<ReportDetailRow>();

export const userExists = async (db: D1Database, id: string) =>
  (await db.prepare("SELECT 1 AS found FROM users WHERE id = ?").bind(id).first()) !== null;

export const isAdmin = async (db: D1Database, id: string) =>
  (await db.prepare("SELECT 1 AS found FROM users WHERE id = ? AND role = 'ADMIN'").bind(id).first()) !== null;

export const isBookingParty = async (db: D1Database, bookingId: string, userId: string) =>
  (await db
    .prepare(
      `SELECT 1 AS found FROM bookings b JOIN mentors m ON m.id = b.mentor_id
       WHERE b.id = ? AND (b.student_id = ? OR m.user_id = ?)`,
    )
    .bind(bookingId, userId, userId)
    .first()) !== null;

export async function insert(db: D1Database, r: Pick<ReportRow, "id" | "reported_by" | "reported_user_id" | "booking_id" | "category" | "description" | "created_at">) {
  await db
    .prepare(
      `INSERT INTO reports (id, reported_by, reported_user_id, booking_id, category, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    )
    .bind(r.id, r.reported_by, r.reported_user_id, r.booking_id, r.category, r.description, r.created_at, r.created_at)
    .run();
}

// false when the report is already closed
export async function updateOpen(
  db: D1Database,
  r: { id: string; status: ReportStatus; assignedAdminId: string; resolution: string | null; resolvedAt: string | null; now: string },
) {
  const res = await db
    .prepare(
      `UPDATE reports SET status = ?, assigned_admin_id = ?, resolution = ?, resolved_at = ?, updated_at = ?
       WHERE id = ? AND status IN ('OPEN', 'UNDER_REVIEW')`,
    )
    .bind(r.status, r.assignedAdminId, r.resolution, r.resolvedAt, r.now, r.id)
    .run();
  return res.meta.changes > 0;
}

export async function listByReporter(db: D1Database, userId: string, limit: number, offset: number) {
  const [rows, count] = await db.batch([
    db.prepare(`${DETAIL_SQL} WHERE r.reported_by = ? ORDER BY r.created_at DESC, r.id LIMIT ? OFFSET ?`).bind(userId, limit, offset),
    db.prepare("SELECT COUNT(*) AS total FROM reports WHERE reported_by = ?").bind(userId),
  ]);
  return {
    rows: rows!.results as ReportDetailRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}

export async function listAll(db: D1Database, status: ReportStatus | undefined, limit: number, offset: number) {
  // ?1 IS NULL keeps one statement for both cases
  const [rows, count] = await db.batch([
    db
      .prepare(`${DETAIL_SQL} WHERE (?1 IS NULL OR r.status = ?1) ORDER BY r.created_at DESC, r.id LIMIT ?2 OFFSET ?3`)
      .bind(status ?? null, limit, offset),
    db.prepare("SELECT COUNT(*) AS total FROM reports WHERE (?1 IS NULL OR status = ?1)").bind(status ?? null),
  ]);
  return {
    rows: rows!.results as ReportDetailRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}

// a rescheduled booking continues as a new row, so it is not counted twice
export const adminStats = (db: D1Database) =>
  db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM mentors WHERE verification_status = 'APPROVED') AS mentors,
         (SELECT COUNT(*) FROM bookings WHERE status <> 'RESCHEDULED') AS bookings,
         (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE status = 'PAID') AS revenue_cents`,
    )
    .first<AdminStatsRow>();
