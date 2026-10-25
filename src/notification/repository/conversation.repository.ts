import type { ConversationListRow, MessageRow } from "../entity/notification.entity";

export const userExists = async (db: D1Database, userId: string) =>
  (await db.prepare("SELECT 1 AS found FROM users WHERE id = ?").bind(userId).first()) !== null;

export const conversationExists = async (db: D1Database, id: string) =>
  (await db.prepare("SELECT 1 AS found FROM conversations WHERE id = ?").bind(id).first()) !== null;

export const isParticipant = async (db: D1Database, conversationId: string, userId: string) =>
  (await db
    .prepare("SELECT 1 AS found FROM conversation_participants WHERE conversation_id = ? AND user_id = ?")
    .bind(conversationId, userId)
    .first()) !== null;

// a chat with exactly these two users
export const findDirect = async (db: D1Database, userA: string, userB: string) =>
  (
    await db
      .prepare(
        `SELECT a.conversation_id AS id FROM conversation_participants a
         JOIN conversation_participants b ON b.conversation_id = a.conversation_id AND b.user_id = ?2
         WHERE a.user_id = ?1
           AND (SELECT COUNT(*) FROM conversation_participants p WHERE p.conversation_id = a.conversation_id) = 2
         LIMIT 1`,
      )
      .bind(userA, userB)
      .first<{ id: string }>()
  )?.id ?? null;

export const insertDirect = (db: D1Database, id: string, userA: string, userB: string, now: string) =>
  db.batch([
    db.prepare("INSERT INTO conversations (id, created_at) VALUES (?, ?)").bind(id, now),
    db
      .prepare("INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?), (?, ?, ?)")
      .bind(id, userA, now, id, userB, now),
  ]);

const LIST_SQL = `SELECT c.id,
    (SELECT json_group_array(p.user_id) FROM conversation_participants p WHERE p.conversation_id = c.id) AS participants,
    (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.sent_at DESC LIMIT 1) AS last_content,
    (SELECT MAX(m.sent_at) FROM messages m WHERE m.conversation_id = c.id) AS last_sent_at,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ?1 AND m.read_at IS NULL) AS unread_count,
    c.created_at
  FROM conversations c
  JOIN conversation_participants me ON me.conversation_id = c.id AND me.user_id = ?1`;

export const listForUser = async (db: D1Database, userId: string) =>
  (await db.prepare(`${LIST_SQL} ORDER BY COALESCE(last_sent_at, c.created_at) DESC`).bind(userId).all<ConversationListRow>())
    .results;

export const findForUser = (db: D1Database, id: string, userId: string) =>
  db.prepare(`${LIST_SQL} WHERE c.id = ?2`).bind(userId, id).first<ConversationListRow>();

export async function listMessages(db: D1Database, conversationId: string, limit: number, offset: number) {
  const [rows, count] = await db.batch([
    db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC, id DESC LIMIT ? OFFSET ?")
      .bind(conversationId, limit, offset),
    db.prepare("SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?").bind(conversationId),
  ]);
  return {
    rows: rows!.results as MessageRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}

export const insertMessage = (db: D1Database, m: MessageRow) =>
  db
    .prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, content, attachment_key, sent_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(m.id, m.conversation_id, m.sender_id, m.content, m.attachment_key, m.sent_at, m.read_at)
    .run();

export const markReadFromOthers = (db: D1Database, conversationId: string, userId: string, now: string) =>
  db
    .prepare("UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL")
    .bind(now, conversationId, userId)
    .run();
