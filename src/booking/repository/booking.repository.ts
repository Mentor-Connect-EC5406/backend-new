import type { BookingRow, MentorRow, SlotRow } from "../entity/booking.entity";

export const findById = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<BookingRow>();

export const findSlot = (db: D1Database, id: string) =>
  db
    .prepare("SELECT id, mentor_id, start_time, end_time, status, version FROM availability_slots WHERE id = ?")
    .bind(id)
    .first<SlotRow>();

export const findMentor = (db: D1Database, id: string) =>
  db
    .prepare("SELECT id, user_id, hourly_rate_cents, currency, verification_status FROM mentors WHERE id = ?")
    .bind(id)
    .first<MentorRow>();

export const findMentorIdByUser = async (db: D1Database, userId: string) =>
  (await db.prepare("SELECT id FROM mentors WHERE user_id = ?").bind(userId).first<{ id: string }>())?.id ?? null;

const LIST_SQL = {
  student_id: {
    rows: `SELECT * FROM bookings WHERE student_id = ?1 AND (?2 IS NULL OR status = ?2)
           ORDER BY created_at DESC LIMIT ?3 OFFSET ?4`,
    count: "SELECT COUNT(*) AS total FROM bookings WHERE student_id = ?1 AND (?2 IS NULL OR status = ?2)",
  },
  mentor_id: {
    rows: `SELECT * FROM bookings WHERE mentor_id = ?1 AND (?2 IS NULL OR status = ?2)
           ORDER BY created_at DESC LIMIT ?3 OFFSET ?4`,
    count: "SELECT COUNT(*) AS total FROM bookings WHERE mentor_id = ?1 AND (?2 IS NULL OR status = ?2)",
  },
};

export async function listBy(
  db: D1Database,
  column: keyof typeof LIST_SQL,
  ownerId: string,
  status: string | null,
  limit: number,
  offset: number,
) {
  const [rows, count] = await db.batch([
    db.prepare(LIST_SQL[column].rows).bind(ownerId, status, limit, offset),
    db.prepare(LIST_SQL[column].count).bind(ownerId, status),
  ]);
  return {
    rows: rows!.results as BookingRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}

// frees a slot only when no live booking uses it any more
export const releaseSlot = (db: D1Database, slotId: string, now: string) =>
  db
    .prepare(
      `UPDATE availability_slots SET status = 'AVAILABLE', version = version + 1, updated_at = ?1
       WHERE id = ?2 AND status IN ('HELD', 'BOOKED')
         AND NOT EXISTS (SELECT 1 FROM bookings WHERE slot_id = ?2 AND status NOT IN ('CANCELLED', 'RESCHEDULED'))`,
    )
    .bind(now, slotId);

// holds the slot and inserts the booking in one batch; false when the slot was taken meanwhile
export async function insertWithHold(db: D1Database, b: BookingRow, slotVersion: number): Promise<boolean> {
  const [, insert] = await db.batch([
    db
      .prepare(
        `UPDATE availability_slots SET status = 'HELD', version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'AVAILABLE' AND version = ?`,
      )
      .bind(b.created_at, b.slot_id, slotVersion),
    db
      .prepare(
        `INSERT INTO bookings (id, student_id, mentor_id, slot_id, scheduled_start, scheduled_end, topic, price_cents,
                               currency, status, cancellation_reason, rescheduled_from_id, expires_at, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, NULL, ?, ?, ?
         FROM availability_slots WHERE id = ? AND status = 'HELD' AND version = ?`,
      )
      .bind(
        b.id, b.student_id, b.mentor_id, b.slot_id, b.scheduled_start, b.scheduled_end, b.topic, b.price_cents,
        b.currency, b.expires_at, b.created_at, b.updated_at, b.slot_id, slotVersion + 1,
      ),
  ]);
  return insert!.meta.changes === 1;
}

// PENDING (not expired) to CONFIRMED, slot BOOKED, session created; safe to repeat
export async function confirm(db: D1Database, b: BookingRow, sessionId: string, meetingUrl: string, now: string) {
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE bookings SET status = 'CONFIRMED', expires_at = NULL, updated_at = ?1
         WHERE id = ?2 AND status = 'PENDING' AND (expires_at IS NULL OR expires_at > ?1)`,
      )
      .bind(now, b.id),
    db
      .prepare(
        `UPDATE availability_slots SET status = 'BOOKED', version = version + 1, updated_at = ?1
         WHERE id = ?2 AND status = 'HELD' AND (SELECT status FROM bookings WHERE id = ?3) = 'CONFIRMED'`,
      )
      .bind(now, b.slot_id, b.id),
    db
      .prepare(
        `INSERT OR IGNORE INTO mentoring_sessions (id, booking_id, meeting_url, meeting_provider, status, created_at, updated_at)
         SELECT ?1, ?2, ?3, 'JITSI', 'SCHEDULED', ?4, ?4 WHERE (SELECT status FROM bookings WHERE id = ?2) = 'CONFIRMED'`,
      )
      .bind(sessionId, b.id, meetingUrl, now),
  ]);
  return update!.meta.changes === 1;
}

// PENDING or CONFIRMED to CANCELLED, slot back to AVAILABLE, open session CANCELLED
export async function cancel(db: D1Database, b: BookingRow, reason: string | null, now: string) {
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE bookings SET status = 'CANCELLED', cancellation_reason = ?1, expires_at = NULL, updated_at = ?2
         WHERE id = ?3 AND status IN ('PENDING', 'CONFIRMED')`,
      )
      .bind(reason, now, b.id),
    releaseSlot(db, b.slot_id, now),
    db
      .prepare(
        `UPDATE mentoring_sessions SET status = 'CANCELLED', updated_at = ?1
         WHERE booking_id = ?2 AND status IN ('SCHEDULED', 'IN_PROGRESS')
           AND (SELECT status FROM bookings WHERE id = ?2) = 'CANCELLED'`,
      )
      .bind(now, b.id),
  ]);
  return update!.meta.changes === 1;
}

export const findExpired = async (db: D1Database, now: string, limit: number) =>
  (
    await db
      .prepare("SELECT * FROM bookings WHERE status = 'PENDING' AND expires_at <= ? ORDER BY expires_at LIMIT ?")
      .bind(now, limit)
      .all<BookingRow>()
  ).results;

export async function expire(db: D1Database, b: BookingRow, now: string) {
  const [update] = await db.batch([
    db
      .prepare(
        `UPDATE bookings SET status = 'CANCELLED', cancellation_reason = 'Booking expired', updated_at = ?1
         WHERE id = ?2 AND status = 'PENDING' AND expires_at <= ?1`,
      )
      .bind(now, b.id),
    releaseSlot(db, b.slot_id, now),
  ]);
  return update!.meta.changes === 1;
}
