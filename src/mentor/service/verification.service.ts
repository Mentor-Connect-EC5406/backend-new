import type { CurrentUser } from "../../config/current-user";
import { badRequest, conflict, notFound } from "../../exception/api-error";
import { type Page, offsetOf, toPage } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type {
  AdminVerificationResponse,
  ListVerificationsQuery,
  ReviewVerificationRequest,
  SubmitVerificationRequest,
  VerificationResponse,
} from "../dto/mentor.dto";
import type { VerificationRow } from "../entity/mentor.entity";
import * as repo from "../repository/verification.repository";
import { requireMentor } from "./mentor.service";

const toResponse = (v: VerificationRow): VerificationResponse => ({
  id: v.id,
  mentorId: v.mentor_id,
  documentKey: v.document_key,
  status: v.status,
  reviewedBy: v.reviewed_by,
  reviewNote: v.review_note,
  submittedAt: v.submitted_at,
  reviewedAt: v.reviewed_at,
});

// documentUrl needs R2, later
const toAdminResponse = (v: VerificationRow): AdminVerificationResponse => ({ ...toResponse(v), documentUrl: null });

export async function submit(
  db: D1Database,
  me: CurrentUser,
  req: SubmitVerificationRequest,
): Promise<VerificationResponse> {
  const mentor = await requireMentor(db, me.id);
  if (!req.documentKey.startsWith(`verifications/${mentor.id}/`)) {
    throw badRequest("Validation failed", [
      { field: "documentKey", message: `must start with verifications/${mentor.id}/` },
    ]);
  }
  if (await repo.findPending(db, mentor.id)) throw conflict("A PENDING verification already exists");
  const id = newId();
  await repo.insert(db, id, mentor.id, req.documentKey, nowIso());
  return toResponse((await repo.findById(db, id))!);
}

export async function listMine(db: D1Database, me: CurrentUser): Promise<VerificationResponse[]> {
  const mentor = await requireMentor(db, me.id);
  return (await repo.listByMentor(db, mentor.id)).map(toResponse);
}

export async function listAll(db: D1Database, q: ListVerificationsQuery): Promise<Page<AdminVerificationResponse>> {
  const { rows, total } = await repo.list(db, q.status, q.size, offsetOf(q));
  return toPage(rows.map(toAdminResponse), q, total);
}

export async function review(
  db: D1Database,
  admin: CurrentUser,
  id: string,
  req: ReviewVerificationRequest,
): Promise<VerificationResponse> {
  const v = await repo.findById(db, id);
  if (!v) throw notFound("Verification not found");
  if (v.status !== "PENDING") throw conflict("Verification is already reviewed");
  await repo.review(db, {
    id,
    mentorId: v.mentor_id,
    status: req.status,
    reviewedBy: admin.id,
    reviewNote: req.reviewNote ?? null,
    now: nowIso(),
  });
  return toResponse((await repo.findById(db, id))!);
}

// R2 comes later
export const uploadUrl = () => ({ uploadUrl: null, key: null });
