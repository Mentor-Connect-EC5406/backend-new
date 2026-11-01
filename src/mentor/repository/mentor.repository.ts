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

export async function insert(db: D1Database, id: string, userId: string, r: UpsertMentorRequest, extras: string, now: string) {
  await db
    .prepare(
      `INSERT INTO mentors (id, user_id, title, organization, industry, bio, experience_years, hourly_rate_cents, currency, skills, profile_extras, verification_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    )
    .bind(id, userId, r.title, r.organization ?? null, r.industry ?? null, r.bio ?? null, r.experienceYears, r.hourlyRateCents ?? 0, r.currency ?? "LKR", JSON.stringify(r.skills ?? []), extras, now, now)
    .run();
}

export async function update(db: D1Database, id: string, r: UpsertMentorRequest, extras: string, now: string) {
  await db
    .prepare(
      `UPDATE mentors SET title = ?, organization = ?, industry = ?, bio = ?, experience_years = ?, hourly_rate_cents = COALESCE(?, hourly_rate_cents),
         currency = COALESCE(?, currency), skills = COALESCE(?, skills), profile_extras = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(r.title, r.organization ?? null, r.industry ?? null, r.bio ?? null, r.experienceYears, r.hourlyRateCents ?? null, r.currency ?? null, r.skills ? JSON.stringify(r.skills) : null, extras, now, id)
    .run();
}

const SEARCH_ORDER = {
  rating: "m.rating_avg DESC",
  price: "m.hourly_rate_cents ASC",
  experience: "m.experience_years DESC",
};

export async function search(db: D1Database, f: SearchMentorsQuery) {
  const where = ["m.verification_status = 'APPROVED'"];
  const params: unknown[] = [];
  const text = f.query ?? f.q;
  if (text) {
    where.push(`(u.first_name || ' ' || u.last_name LIKE ? OR m.title LIKE ? OR m.organization LIKE ? OR m.skills LIKE ?
      OR EXISTS (SELECT 1 FROM mentor_expertises me JOIN expertises e ON e.id = me.expertise_id WHERE me.mentor_id = m.id AND e.name LIKE ?))`);
    params.push(...Array<string>(5).fill(`%${text}%`));
  }
  if (f.industry) {
    where.push("m.industry = ? COLLATE NOCASE");
    params.push(f.industry);
  }
  if (f.industries?.length) {
    where.push(`m.industry COLLATE NOCASE IN (${f.industries.map(() => "?").join(",")})`);
    params.push(...f.industries);
  }
  if (f.maxRateCents !== undefined) {
    where.push("m.hourly_rate_cents <= ?");
    params.push(f.maxRateCents);
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
    .prepare(`SELECT COUNT(*) AS n FROM mentors m JOIN users u ON u.id = m.user_id WHERE ${clause}`)
    .bind(...params)
    .first<{ n: number }>();
  const rows = await db
    .prepare(`${WITH_USER} WHERE ${clause} ORDER BY ${SEARCH_ORDER[f.sort ?? "rating"]}, m.id LIMIT ? OFFSET ?`)
    .bind(...params, f.size, f.page * f.size)
    .all<MentorWithUserRow>();
  return { rows: rows.results, total: total?.n ?? 0 };
}

// saving twice is not an error
export async function saveForStudent(db: D1Database, studentId: string, mentorId: string, now: string) {
  await db
    .prepare("INSERT OR IGNORE INTO saved_mentors (student_id, mentor_id, created_at) VALUES (?, ?, ?)")
    .bind(studentId, mentorId, now)
    .run();
}

export async function unsaveForStudent(db: D1Database, studentId: string, mentorId: string) {
  await db.prepare("DELETE FROM saved_mentors WHERE student_id = ? AND mentor_id = ?").bind(studentId, mentorId).run();
}

// a saved mentor stays hidden while not APPROVED
export async function listSaved(db: D1Database, studentId: string, limit: number, offset: number) {
  const total = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM saved_mentors s JOIN mentors m ON m.id = s.mentor_id
       WHERE s.student_id = ? AND m.verification_status = 'APPROVED'`,
    )
    .bind(studentId)
    .first<{ n: number }>();
  const rows = await db
    .prepare(
      `${WITH_USER} JOIN saved_mentors s ON s.mentor_id = m.id
       WHERE s.student_id = ? AND m.verification_status = 'APPROVED'
       ORDER BY s.created_at DESC, m.id LIMIT ? OFFSET ?`,
    )
    .bind(studentId, limit, offset)
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
