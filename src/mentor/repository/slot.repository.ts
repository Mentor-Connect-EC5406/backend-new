import type { SlotRow } from "../entity/mentor.entity";

export const findById = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM availability_slots WHERE id = ?").bind(id).first<SlotRow>();

// false when the time overlaps another slot of the mentor
export async function insert(
  db: D1Database,
  s: { id: string; mentorId: string; startTime: string; endTime: string; timezone: string; now: string },
) {
  const res = await db
    .prepare(
      `INSERT INTO availability_slots (id, mentor_id, start_time, end_time, timezone, status, version, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, 'AVAILABLE', 0, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM availability_slots WHERE mentor_id = ? AND start_time < ? AND end_time > ?)`,
    )
    .bind(s.id, s.mentorId, s.startTime, s.endTime, s.timezone, s.now, s.now, s.mentorId, s.endTime, s.startTime)
    .run();
  return res.meta.changes > 0;
}

// false when the new time overlaps another slot of the mentor
export async function update(
  db: D1Database,
  s: { id: string; mentorId: string; startTime: string; endTime: string; timezone: string; status: string; now: string },
) {
  const res = await db
    .prepare(
      `UPDATE availability_slots SET start_time = ?, end_time = ?, timezone = ?, status = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND NOT EXISTS (
         SELECT 1 FROM availability_slots o WHERE o.mentor_id = ? AND o.id <> ? AND o.start_time < ? AND o.end_time > ?
       )`,
    )
    .bind(s.startTime, s.endTime, s.timezone, s.status, s.now, s.id, s.mentorId, s.id, s.endTime, s.startTime)
    .run();
  return res.meta.changes > 0;
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

export async function listPublic(db: D1Database, mentorId: string, from: string, to: string) {
  const res = await db
    .prepare(
      `SELECT * FROM availability_slots
       WHERE mentor_id = ? AND start_time >= ? AND start_time <= ?
       ORDER BY start_time`,
    )
    .bind(mentorId, from, to)
    .all<SlotRow>();
  return res.results;
}
