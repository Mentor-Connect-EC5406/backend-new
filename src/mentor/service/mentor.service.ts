import type { CurrentUser } from "../../config/current-user";
import { notFound } from "../../exception/api-error";
import { type Page, toPage } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type {
  MentorResponse,
  MentorSummary,
  SearchMentorsQuery,
  UpsertMentorRequest,
} from "../dto/mentor.dto";
import type { MentorExpertiseRow, MentorRow, MentorWithUserRow } from "../entity/mentor.entity";
import * as repo from "../repository/mentor.repository";

export async function requireMentor(db: D1Database, userId: string): Promise<MentorRow> {
  const row = await repo.findByUserId(db, userId);
  if (!row) throw notFound("Mentor profile not found");
  return row;
}

const toSummary = (r: MentorWithUserRow, exps: MentorExpertiseRow[]): MentorSummary => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  profileImageKey: r.profile_image_key,
  title: r.title,
  organization: r.organization,
  industry: r.industry,
  experienceYears: r.experience_years,
  hourlyRateCents: r.hourly_rate_cents,
  currency: r.currency,
  ratingAvg: r.rating_avg,
  ratingCount: r.rating_count,
  expertises: exps.map((e) => ({ id: e.expertise_id, name: e.name })),
});

export const toExpertiseResponses = (exps: MentorExpertiseRow[]) =>
  exps.map((e) => ({
    expertiseId: e.expertise_id,
    name: e.name,
    categoryName: e.category_name,
    proficiency: e.proficiency,
  }));

const toDetail = (r: MentorWithUserRow, exps: MentorExpertiseRow[]): MentorResponse => {
  const { expertises: _summaryExpertises, ...base } = toSummary(r, exps);
  return {
    ...base,
    userId: r.user_id,
    bio: r.bio,
    verificationStatus: r.verification_status,
    expertises: toExpertiseResponses(exps),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

async function detailOf(db: D1Database, row: MentorWithUserRow): Promise<MentorResponse> {
  return toDetail(row, await repo.findExpertises(db, [row.id]));
}

export async function getMyProfile(db: D1Database, me: CurrentUser): Promise<MentorResponse> {
  const row = await repo.findWithUserByUserId(db, me.id);
  if (!row) throw notFound("Mentor profile not found");
  return detailOf(db, row);
}

export async function upsertMyProfile(
  db: D1Database,
  me: CurrentUser,
  req: UpsertMentorRequest,
): Promise<{ mentor: MentorResponse; created: boolean }> {
  const existing = await repo.findByUserId(db, me.id);
  const now = nowIso();
  if (existing) await repo.update(db, existing.id, req, now);
  else await repo.insert(db, newId(), me.id, req, now);
  const mentor = await getMyProfile(db, me);
  return { mentor, created: !existing };
}

export async function search(db: D1Database, q: SearchMentorsQuery): Promise<Page<MentorSummary>> {
  const { rows, total } = await repo.search(db, q);
  const exps = await repo.findExpertises(db, rows.map((r) => r.id));
  const content = rows.map((r) =>
    toSummary(
      r,
      exps.filter((e) => e.mentor_id === r.id),
    ),
  );
  return toPage(content, q, total);
}

export async function getById(db: D1Database, viewer: CurrentUser, id: string): Promise<MentorResponse> {
  const row = await repo.findWithUserById(db, id);
  const visible =
    row && (row.verification_status === "APPROVED" || viewer.role === "ADMIN" || viewer.id === row.user_id);
  if (!row || !visible) throw notFound("Mentor not found");
  return detailOf(db, row);
}
