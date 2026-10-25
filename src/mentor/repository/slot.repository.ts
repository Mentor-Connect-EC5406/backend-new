import type { SlotRow } from "../entity/mentor.entity";

export const findById = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM availability_slots WHERE id = ?").bind(id).first<SlotRow>();

export async function insert(
  db: D1Database,
  s: { id: string; mentorId: string; startTime: string; endTime: string; timezone: string; now: string },
) {
  await db
    .prepare(
      `INSERT INTO availability_slots (id, mentor_id, start_time, end_time, timezone, status, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 0, ?, ?)`,
    )
    .bind(s.id, s.mentorId, s.startTime, s.endTime, s.timezone, s.now, s.now)
    .run();
}

export async function update(
  db: D1Database,
  s: { id: string; startTime: string; endTime: string; timezone: string; status: string; now: string },
) {
  await db
    .prepare(
      `UPDATE availability_slots SET start_time = ?, end_time = ?, timezone = ?, status = ?, version = version + 1, updated_at = ?
       WHERE id = ?`,
    )
    .bind(s.startTime, s.endTime, s.timezone, s.status, s.now, s.id)
    .run();
}

export async function remove(db: D1Database, id: string) {
  await db.prepare("DELETE FROM availability_slots WHERE id = ?").bind(id).run();
}

export async function listOwn(db: D1Database, mentorId: string, f: { status?: string; from?: string; to?: string }) {
  const where = ["mentor_id = ?"];
  const params: unknown[] = [mentorId];
  if (f.status) {
    where.push("status = ?");
    params.push(f.status);
  }
  if (f.from) {
    where.push("start_time >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("start_time <= ?");
    params.push(f.to);
  }
  const res = await db
    .prepare(`SELECT * FROM availability_slots WHERE ${where.join(" AND ")} ORDER BY start_time`)
    .bind(...params)
    .all<SlotRow>();
  return res.results;
}

export async function listAvailable(db: D1Database, mentorId: string, from: string, to: string) {
  const res = await db
    .prepare(
      `SELECT * FROM availability_slots
       WHERE mentor_id = ? AND status = 'AVAILABLE' AND start_time >= ? AND start_time <= ?
       ORDER BY start_time`,
    )
    .bind(mentorId, from, to)
    .all<SlotRow>();
  return res.results;
}
