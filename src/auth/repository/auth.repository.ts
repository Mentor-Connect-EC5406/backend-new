import type { AuthUserRow } from "../entity/auth-user.entity";

export const findByEmail = (db: D1Database, email: string) =>
  db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<AuthUserRow>();

export const findById = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<AuthUserRow>();

export type NewUser = {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: "STUDENT" | "MENTOR";
  now: string;
};

// users.id and external_auth_id hold the same value; a STUDENT also gets an empty profile
export async function insertUser(db: D1Database, u: NewUser, profileId: string | null) {
  const stmts = [
    db
      .prepare(
        `INSERT INTO users (id, external_auth_id, email, password_hash, first_name, last_name, phone, role, account_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      )
      .bind(u.id, u.id, u.email, u.passwordHash, u.firstName, u.lastName, u.phone, u.role, u.now, u.now),
  ];
  if (profileId) {
    stmts.push(
      db.prepare("INSERT INTO student_profiles (id, user_id, updated_at) VALUES (?, ?, ?)").bind(profileId, u.id, u.now),
    );
  }
  await db.batch(stmts);
}
