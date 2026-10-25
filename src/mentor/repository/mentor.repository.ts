import type { SearchMentorsQuery, UpsertMentorRequest } from "../dto/mentor.dto";
import type { MentorExpertiseRow, MentorRow, MentorWithUserRow } from "../entity/mentor.entity";

const WITH_USER = `SELECT m.*, u.first_name, u.last_name, u.profile_image_key
  FROM mentors m JOIN users u ON u.id = m.user_id`;

export const findByUserId = (db: D1Database, userId: string) =>
  db.prepare("SELECT * FROM mentors WHERE user_id = ?").bind(userId).first<MentorRow>();

export const findWithUserById = (db: D1Database, id: string) =>
  db.prepare(`${WITH_USER} WHERE m.id = ?`).bind(id).first<MentorWithUserRow>();

export const findWithUserByUserId = (db: D1Database, userId: string) =>
  db.prepare(`${WITH_USER} WHERE m.user_id = ?`).bind(userId).first<MentorWithUserRow>();

export async function insert(db: D1Database, id: string, userId: string, r: UpsertMentorRequest, now: string) {
  await db
    .prepare(
      `INSERT INTO mentors (id, user_id, title, organization, industry, bio, experience_years, hourly_rate_cents, currency, verification_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    )
    .bind(id, userId, r.title, r.organization ?? null, r.industry ?? null, r.bio ?? null, r.experienceYears, r.hourlyRateCents, r.currency ?? "USD", now, now)
    .run();
}

export async function update(db: D1Database, id: string, r: UpsertMentorRequest, now: string) {
  await db
    .prepare(
      `UPDATE mentors SET title = ?, organization = ?, industry = ?, bio = ?, experience_years = ?, hourly_rate_cents = ?,
         currency = COALESCE(?, currency), updated_at = ? WHERE id = ?`,
    )
    .bind(r.title, r.organization ?? null, r.industry ?? null, r.bio ?? null, r.experienceYears, r.hourlyRateCents, r.currency ?? null, now, id)
    .run();
}

export async function search(db: D1Database, f: SearchMentorsQuery) {
  const where = ["m.verification_status = 'APPROVED'"];
  const params: unknown[] = [];
  if (f.q) {
    where.push("(m.title LIKE ? OR m.organization LIKE ?)");
    params.push(`%${f.q}%`, `%${f.q}%`);
  }
  if (f.industry) {
    where.push("m.industry = ? COLLATE NOCASE");
    params.push(f.industry);
  }
  if (f.expertiseId) {
    where.push("EXISTS (SELECT 1 FROM mentor_expertises me WHERE me.mentor_id = m.id AND me.expertise_id = ?)");
    params.push(f.expertiseId);
  }
  if (f.minRating !== undefined) {
    where.push("m.rating_avg >= ?");
    params.push(f.minRating);
  }
  const clause = where.join(" AND ");

  const total = await db
    .prepare(`SELECT COUNT(*) AS n FROM mentors m WHERE ${clause}`)
    .bind(...params)
    .first<{ n: number }>();
  const rows = await db
    .prepare(`${WITH_USER} WHERE ${clause} ORDER BY m.rating_avg DESC, m.id LIMIT ? OFFSET ?`)
    .bind(...params, f.size, f.page * f.size)
    .all<MentorWithUserRow>();
  return { rows: rows.results, total: total?.n ?? 0 };
}

export async function findExpertises(db: D1Database, mentorIds: string[]): Promise<MentorExpertiseRow[]> {
  if (mentorIds.length === 0) return [];
  const marks = mentorIds.map(() => "?").join(",");
  const res = await db
    .prepare(
      `SELECT me.mentor_id, me.expertise_id, e.name, c.name AS category_name, me.proficiency
       FROM mentor_expertises me
       JOIN expertises e ON e.id = me.expertise_id
       JOIN expertise_categories c ON c.id = e.category_id
       WHERE me.mentor_id IN (${marks}) ORDER BY e.name`,
    )
    .bind(...mentorIds)
    .all<MentorExpertiseRow>();
  return res.results;
}
