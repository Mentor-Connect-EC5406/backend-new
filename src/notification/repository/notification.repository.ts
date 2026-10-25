import type { NotificationRow } from "../entity/notification.entity";

export const insertNotification = (db: D1Database, n: NotificationRow) =>
  db
    .prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, channel, status, retry_count, scheduled_at, sent_at, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      n.id, n.user_id, n.type, n.title, n.message, n.channel, n.status,
      n.retry_count, n.scheduled_at, n.sent_at, n.read_at, n.created_at,
    )
    .run();

export async function listForUser(db: D1Database, userId: string, status: string | null, limit: number, offset: number) {
  const [rows, count] = await db.batch([
    db
      .prepare(
        `SELECT * FROM notifications WHERE user_id = ?1 AND (?2 IS NULL OR status = ?2)
         ORDER BY created_at DESC LIMIT ?3 OFFSET ?4`,
      )
      .bind(userId, status, limit, offset),
    db
      .prepare("SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?1 AND (?2 IS NULL OR status = ?2)")
      .bind(userId, status),
  ]);
  return {
    rows: rows!.results as NotificationRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}

export const findForUser = (db: D1Database, id: string, userId: string) =>
  db.prepare("SELECT * FROM notifications WHERE id = ? AND user_id = ?").bind(id, userId).first<NotificationRow>();

export const markRead = (db: D1Database, id: string, now: string) =>
  db
    .prepare("UPDATE notifications SET status = 'READ', read_at = COALESCE(read_at, ?) WHERE id = ?")
    .bind(now, id)
    .run();

export const markAllRead = (db: D1Database, userId: string, now: string) =>
  db
    .prepare("UPDATE notifications SET status = 'READ', read_at = ? WHERE user_id = ? AND read_at IS NULL")
    .bind(now, userId)
    .run();
