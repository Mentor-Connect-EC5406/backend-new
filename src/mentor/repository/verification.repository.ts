import type { VerificationDetailRow, VerificationRow } from "../entity/mentor.entity";

export const findById = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM mentor_verifications WHERE id = ?").bind(id).first<VerificationRow>();

export const findPending = (db: D1Database, mentorId: string) =>
  db
    .prepare("SELECT * FROM mentor_verifications WHERE mentor_id = ? AND status = 'PENDING' LIMIT 1")
    .bind(mentorId)
    .first<VerificationRow>();

export async function insert(db: D1Database, id: string, mentorId: string, documentKey: string, now: string) {
  await db
    .prepare("INSERT INTO mentor_verifications (id, mentor_id, document_key, status, submitted_at) VALUES (?, ?, ?, 'PENDING', ?)")
    .bind(id, mentorId, documentKey, now)
    .run();
}

export async function listByMentor(db: D1Database, mentorId: string) {
  const res = await db
    .prepare("SELECT * FROM mentor_verifications WHERE mentor_id = ? ORDER BY submitted_at DESC, id")
    .bind(mentorId)
    .all<VerificationRow>();
  return res.results;
}

export async function list(db: D1Database, status: string | undefined, size: number, offset: number) {
  const clause = status ? "WHERE v.status = ?" : "";
  const params = status ? [status] : [];
  const total = await db
    .prepare(`SELECT COUNT(*) AS n FROM mentor_verifications v ${clause}`)
    .bind(...params)
    .first<{ n: number }>();
  const rows = await db
    .prepare(
      `SELECT v.*, u.first_name, u.last_name, u.email, m.title, m.organization, m.industry, m.experience_years
       FROM mentor_verifications v
       JOIN mentors m ON m.id = v.mentor_id
       JOIN users u ON u.id = m.user_id
       ${clause} ORDER BY v.submitted_at DESC, v.id LIMIT ? OFFSET ?`,
    )
    .bind(...params, size, offset)
    .all<VerificationDetailRow>();
  return { rows: rows.results, total: total?.n ?? 0 };
}

// the review result is copied to the mentor in the same batch
export async function review(
  db: D1Database,
  v: { id: string; mentorId: string; status: string; reviewedBy: string; reviewNote: string | null; now: string },
) {
  await db.batch([
    db
      .prepare("UPDATE mentor_verifications SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = ? WHERE id = ?")
      .bind(v.status, v.reviewedBy, v.reviewNote, v.now, v.id),
    db.prepare("UPDATE mentors SET verification_status = ?, updated_at = ? WHERE id = ?").bind(v.status, v.now, v.mentorId),
  ]);
}
