import type { SessionRow } from "../entity/booking.entity";

export const findByBooking = (db: D1Database, bookingId: string) =>
  db.prepare("SELECT * FROM mentoring_sessions WHERE booking_id = ?").bind(bookingId).first<SessionRow>();

export const start = (db: D1Database, sessionId: string, now: string) =>
  db
    .prepare(
      `UPDATE mentoring_sessions SET status = 'IN_PROGRESS', actual_start = ?1, updated_at = ?1
       WHERE id = ?2 AND status = 'SCHEDULED'`,
    )
    .bind(now, sessionId)
    .run();

// session COMPLETED and booking COMPLETED together
export async function complete(db: D1Database, sessionId: string, bookingId: string, now: string) {
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE mentoring_sessions SET status = 'COMPLETED', actual_end = ?1, updated_at = ?1
         WHERE id = ?2 AND status = 'IN_PROGRESS'`,
      )
      .bind(now, sessionId),
    db
      .prepare(
        `UPDATE bookings SET status = 'COMPLETED', updated_at = ?1
         WHERE id = ?2 AND status = 'CONFIRMED' AND (SELECT status FROM mentoring_sessions WHERE id = ?3) = 'COMPLETED'`,
      )
      .bind(now, bookingId, sessionId),
  ]);
  return update!.meta.changes === 1;
}
