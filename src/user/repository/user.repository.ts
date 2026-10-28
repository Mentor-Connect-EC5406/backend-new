import type { ListUsersQuery, UpdateMeRequest } from "../dto/user.dto";
import type { UserRow } from "../entity/user.entity";

const COLUMNS =
  "id, external_auth_id, email, first_name, last_name, phone, profile_image_key, role, account_status, created_at, updated_at";

export const findById = (db: D1Database, id: string) =>
  db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).bind(id).first<UserRow>();

export const findByExternalAuthId = (db: D1Database, sub: string) =>
  db.prepare(`SELECT ${COLUMNS} FROM users WHERE external_auth_id = ?`).bind(sub).first<UserRow>();

export const emailExists = async (db: D1Database, email: string) =>
  (await db.prepare("SELECT 1 AS found FROM users WHERE email = ?").bind(email).first()) !== null;

export type NewRegisteredUser = {
  id: string;
  externalAuthId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: "STUDENT" | "MENTOR";
  now: string;
};

// Asgardeo users have no password_hash; a STUDENT also gets an empty profile
export async function insertRegistered(db: D1Database, u: NewRegisteredUser, profileId: string | null) {
  const stmts = [
    db
      .prepare(
        `INSERT INTO users (id, external_auth_id, email, password_hash, first_name, last_name, phone, role, account_status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      )
      .bind(u.id, u.externalAuthId, u.email, u.firstName, u.lastName, u.phone, u.role, u.now, u.now),
  ];
  if (profileId) {
    stmts.push(
      db.prepare("INSERT INTO student_profiles (id, user_id, updated_at) VALUES (?, ?, ?)").bind(profileId, u.id, u.now),
    );
  }
  await db.batch(stmts);
}

export async function updateProfile(db: D1Database, id: string, r: UpdateMeRequest, now: string) {
  await db
    .prepare("UPDATE users SET first_name = ?, last_name = ?, phone = ?, profile_image_key = ?, updated_at = ? WHERE id = ?")
    .bind(r.firstName, r.lastName, r.phone ?? null, r.profileImageKey ?? null, now, id)
    .run();
}

export async function updateStatus(db: D1Database, id: string, status: string, now: string) {
  await db.prepare("UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?").bind(status, now, id).run();
}

export async function list(db: D1Database, f: ListUsersQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.role) {
    where.push("role = ?");
    params.push(f.role);
  }
  if (f.accountStatus) {
    where.push("account_status = ?");
    params.push(f.accountStatus);
  }
  if (f.q) {
    where.push("(email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)");
    const like = `%${f.q}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = await db
    .prepare(`SELECT COUNT(*) AS n FROM users ${clause}`)
    .bind(...params)
    .first<{ n: number }>();
  const rows = await db
    .prepare(`SELECT ${COLUMNS} FROM users ${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`)
    .bind(...params, f.size, f.page * f.size)
    .all<UserRow>();
  return { rows: rows.results, total: total?.n ?? 0 };
}
