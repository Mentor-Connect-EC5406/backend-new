import type { MentorReviewRow, ReviewRow } from "../entity/booking.entity";

export const existsForBooking = async (db: D1Database, bookingId: string) =>
  (await db.prepare("SELECT 1 AS found FROM reviews WHERE booking_id = ?").bind(bookingId).first()) !== null;

// saves the review and recalculates the mentor rating in one batch
export const insertAndRate = (db: D1Database, r: ReviewRow) =>
  db.batch([
    db
      .prepare(
        `INSERT INTO reviews (id, booking_id, student_id, mentor_id, rating, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.id, r.booking_id, r.student_id, r.mentor_id, r.rating, r.comment, r.created_at),
    db
      .prepare(
        `UPDATE mentors SET
           rating_avg = (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE mentor_id = ?1),
           rating_count = (SELECT COUNT(*) FROM reviews WHERE mentor_id = ?1),
           updated_at = ?2
         WHERE id = ?1`,
      )
      .bind(r.mentor_id, r.created_at),
  ]);

export const mentorIsApproved = async (db: D1Database, mentorId: string) =>
  (await db.prepare("SELECT 1 AS found FROM mentors WHERE id = ? AND verification_status = 'APPROVED'").bind(mentorId).first()) !== null;

export async function listPublicByMentor(db: D1Database, mentorId: string, limit: number, offset: number) {
  const [rows, count] = await db.batch([
    db
      .prepare(
        `SELECT r.*, u.first_name || ' ' || u.last_name AS author
         FROM reviews r LEFT JOIN users u ON u.id = r.student_id
         WHERE r.mentor_id = ? ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(mentorId, limit, offset),
    db.prepare("SELECT COUNT(*) AS total FROM reviews WHERE mentor_id = ?").bind(mentorId),
  ]);
  return {
    rows: rows!.results as MentorReviewRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}

export async function listByMentor(db: D1Database, mentorId: string, limit: number, offset: number) {
  const [rows, count] = await db.batch([
    db
      .prepare("SELECT * FROM reviews WHERE mentor_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(mentorId, limit, offset),
    db.prepare("SELECT COUNT(*) AS total FROM reviews WHERE mentor_id = ?").bind(mentorId),
  ]);
  return {
    rows: rows!.results as ReviewRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}
