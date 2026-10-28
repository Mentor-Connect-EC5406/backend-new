import type { CurrentUser } from "../../config/current-user";
import type { Env } from "../../config/env";
import { badRequest, conflict, notFound } from "../../exception/api-error";
import { type Page, offsetOf, toPage } from "../../util/pagination";
import { MB, createUpload, downloadUrl, requireUploaded, type UploadUrlResponse } from "../../util/r2";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type {
  AdminVerificationResponse,
  ListVerificationsQuery,
  ReviewVerificationRequest,
  SubmitVerificationRequest,
  VerificationResponse,
  VerificationUploadUrlRequest,
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

const DOCUMENT_MAX_BYTES = 10 * MB;

// documentUrl is a presigned R2 link valid for 300 seconds
const toAdminResponse = async (env: Env, v: VerificationRow): Promise<AdminVerificationResponse> => ({
  ...toResponse(v),
  documentUrl: await downloadUrl(env, v.document_key),
});

export async function submit(
  env: Env,
  me: CurrentUser,
  req: SubmitVerificationRequest,
): Promise<VerificationResponse> {
  const db = env.DB;
  const mentor = await requireMentor(db, me.id);
  if (!req.documentKey.startsWith(`verifications/${mentor.id}/`)) {
    throw badRequest("Validation failed", [
      { field: "documentKey", message: `must start with verifications/${mentor.id}/` },
    ]);
  }
  if (await repo.findPending(db, mentor.id)) throw conflict("A PENDING verification already exists");
  await requireUploaded(env, req.documentKey, "documentKey", DOCUMENT_MAX_BYTES);
  const id = newId();
  await repo.insert(db, id, mentor.id, req.documentKey, nowIso());
  return toResponse((await repo.findById(db, id))!);
}

export async function listMine(db: D1Database, me: CurrentUser): Promise<VerificationResponse[]> {
  const mentor = await requireMentor(db, me.id);
  return (await repo.listByMentor(db, mentor.id)).map(toResponse);
}

export async function listAll(env: Env, q: ListVerificationsQuery): Promise<Page<AdminVerificationResponse>> {
  const { rows, total } = await repo.list(env.DB, q.status, q.size, offsetOf(q));
  return toPage(await Promise.all(rows.map((v) => toAdminResponse(env, v))), q, total);
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

// the mentor profile must exist, the key is verifications/{mentorId}/...
export async function uploadUrl(env: Env, me: CurrentUser, req: VerificationUploadUrlRequest): Promise<UploadUrlResponse> {
  const mentor = await requireMentor(env.DB, me.id);
  return createUpload(env, `verifications/${mentor.id}`, req.contentType);
}
