import type { UpdateStudentProfileRequest } from "../dto/user.dto";
import type { StudentProfileRow } from "../entity/student-profile.entity";

export const findByUserId = (db: D1Database, userId: string) =>
  db
    .prepare("SELECT id, user_id, university, faculty, degree, academic_year, bio, interests, updated_at FROM student_profiles WHERE user_id = ?")
    .bind(userId)
    .first<StudentProfileRow>();

// user_id is UNIQUE, so a parallel insert is ignored
export async function insertEmpty(db: D1Database, id: string, userId: string, now: string) {
  await db
    .prepare("INSERT OR IGNORE INTO student_profiles (id, user_id, updated_at) VALUES (?, ?, ?)")
    .bind(id, userId, now)
    .run();
}

// fields that are not sent keep their value
export async function update(db: D1Database, userId: string, r: UpdateStudentProfileRequest, now: string) {
  await db
    .prepare(
      `UPDATE student_profiles SET university = COALESCE(?, university), faculty = COALESCE(?, faculty),
         degree = COALESCE(?, degree), academic_year = COALESCE(?, academic_year), bio = COALESCE(?, bio),
         interests = COALESCE(?, interests), updated_at = ? WHERE user_id = ?`,
    )
    .bind(r.university ?? null, r.faculty ?? null, r.degree ?? null, r.academicYear ?? null, r.bio ?? null, r.interests ?? null, now, userId)
    .run();
}
