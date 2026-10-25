import type { CurrentUser } from "../../config/current-user";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type { StudentProfileResponse, UpdateStudentProfileRequest } from "../dto/user.dto";
import type { StudentProfileRow } from "../entity/student-profile.entity";
import * as repo from "../repository/student-profile.repository";

const toResponse = (r: StudentProfileRow): StudentProfileResponse => ({
  id: r.id,
  userId: r.user_id,
  university: r.university,
  faculty: r.faculty,
  degree: r.degree,
  academicYear: r.academic_year,
  bio: r.bio,
  interests: r.interests,
  updatedAt: r.updated_at,
});

// creates an empty profile when the row is missing
async function ensureProfile(db: D1Database, userId: string): Promise<StudentProfileRow> {
  const existing = await repo.findByUserId(db, userId);
  if (existing) return existing;
  await repo.insertEmpty(db, newId(), userId, nowIso());
  return (await repo.findByUserId(db, userId))!;
}

export async function getProfile(db: D1Database, me: CurrentUser): Promise<StudentProfileResponse> {
  return toResponse(await ensureProfile(db, me.id));
}

export async function updateProfile(
  db: D1Database,
  me: CurrentUser,
  req: UpdateStudentProfileRequest,
): Promise<StudentProfileResponse> {
  await ensureProfile(db, me.id);
  await repo.update(db, me.id, req, nowIso());
  return toResponse((await repo.findByUserId(db, me.id))!);
}
