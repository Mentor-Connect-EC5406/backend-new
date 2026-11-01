import type { CurrentUser } from "../../config/current-user";
import { EMPTY_PROFILE_EXTRAS } from "../../util/profile-extras";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import {
  studentExtrasSchema,
  type StudentExtras,
  type StudentProfileResponse,
  type UpdateStudentProfileRequest,
} from "../dto/user.dto";
import type { StudentProfileRow } from "../entity/student-profile.entity";
import * as repo from "../repository/student-profile.repository";

const EMPTY_EXTRAS: StudentExtras = {
  ...EMPTY_PROFILE_EXTRAS,
  skills: [],
  workPreferences: { openToOpportunities: false, desiredRoles: [], workTypes: [], arrangements: [] },
  visibility: { isPublic: false, showEmail: false, showPhone: false },
};

const toResponse = (r: StudentProfileRow): StudentProfileResponse => ({
  ...EMPTY_EXTRAS,
  ...(JSON.parse(r.profile_extras) as Partial<StudentExtras>),
  id: r.id,
  userId: r.user_id,
  university: r.university,
  faculty: r.faculty,
  degree: r.degree,
  academicYear: r.academic_year,
  bio: r.bio,
  interests: r.interests ? (JSON.parse(r.interests) as string[]) : [],
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
  const existing = await ensureProfile(db, me.id);
  // sections that are not sent keep their value
  const extras = JSON.stringify({ ...(JSON.parse(existing.profile_extras) as object), ...studentExtrasSchema.parse(req) });
  await repo.update(db, me.id, req, extras, nowIso());
  return toResponse((await repo.findByUserId(db, me.id))!);
}
