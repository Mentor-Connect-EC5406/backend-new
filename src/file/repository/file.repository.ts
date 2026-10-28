// access checks read the mentor and notification tables
export const isOwnMentor = async (db: D1Database, mentorId: string, userId: string) =>
  (await db.prepare("SELECT 1 AS found FROM mentors WHERE id = ? AND user_id = ?").bind(mentorId, userId).first()) !== null;

export const isParticipant = async (db: D1Database, conversationId: string, userId: string) =>
  (await db
    .prepare("SELECT 1 AS found FROM conversation_participants WHERE conversation_id = ? AND user_id = ?")
    .bind(conversationId, userId)
    .first()) !== null;
