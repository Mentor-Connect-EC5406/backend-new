import type { CurrentUser, Identity } from "../../config/current-user";
import type { Env } from "../../config/env";
import { badRequest, conflict, notFound } from "../../exception/api-error";
import { type Page, toPage } from "../../util/pagination";
import { MB, createUpload, requireUploaded, type UploadUrlResponse } from "../../util/r2";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type {
  AvatarUploadUrlRequest,
  ListUsersQuery,
  RegisterUserRequest,
  UpdateMeRequest,
  UserResponse,
} from "../dto/user.dto";
import type { UserRow } from "../entity/user.entity";
import * as repo from "../repository/user.repository";

const toResponse = (r: UserRow): UserResponse => ({
  id: r.id,
  email: r.email,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone,
  profileImageKey: r.profile_image_key,
  role: r.role,
  accountStatus: r.account_status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function getOrThrow(db: D1Database, id: string): Promise<UserRow> {
  const row = await repo.findById(db, id);
  if (!row) throw notFound("User not found");
  return row;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// first login: id and external_auth_id are the token sub (a new uuid when sub is not one), email from the token
export async function register(env: Env, identity: Identity, req: RegisterUserRequest): Promise<UserResponse> {
  if (!identity.email) {
    throw badRequest("Validation failed", [{ field: "email", message: "the token has no email claim" }]);
  }
  if (await repo.findByExternalAuthId(env.DB, identity.sub)) throw conflict("User is already registered");
  if (await repo.emailExists(env.DB, identity.email)) throw conflict("Email is already registered");

  const id = UUID.test(identity.sub) ? identity.sub.toLowerCase() : newId();
  try {
    await repo.insertRegistered(
      env.DB,
      {
        id,
        externalAuthId: identity.sub,
        email: identity.email,
        firstName: req.firstName,
        lastName: req.lastName,
        phone: req.phone ?? null,
        role: req.role,
        now: nowIso(),
      },
      req.role === "STUDENT" ? newId() : null,
    );
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw conflict("User is already registered");
    throw e;
  }
  return toResponse(await getOrThrow(env.DB, id));
}

export async function getMe(db: D1Database, me: CurrentUser): Promise<UserResponse> {
  return toResponse(await getOrThrow(db, me.id));
}

const AVATAR_MAX_BYTES = 5 * MB;

export async function updateMe(env: Env, me: CurrentUser, req: UpdateMeRequest): Promise<UserResponse> {
  const current = await getOrThrow(env.DB, me.id);
  const key = req.profileImageKey;
  // a new avatar key must be the caller's own uploaded file
  if (key && key !== current.profile_image_key) {
    if (!key.startsWith(`avatars/${me.id}/`)) {
      throw badRequest("Validation failed", [{ field: "profileImageKey", message: `must start with avatars/${me.id}/` }]);
    }
    await requireUploaded(env, key, "profileImageKey", AVATAR_MAX_BYTES);
  }
  await repo.updateProfile(env.DB, me.id, req, nowIso());
  return toResponse(await getOrThrow(env.DB, me.id));
}

export async function listUsers(db: D1Database, q: ListUsersQuery): Promise<Page<UserResponse>> {
  const { rows, total } = await repo.list(db, q);
  return toPage(rows.map(toResponse), q, total);
}

export async function updateStatus(
  db: D1Database,
  me: CurrentUser,
  id: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<UserResponse> {
  await getOrThrow(db, id);
  if (status === "SUSPENDED" && id === me.id) throw conflict("An admin cannot suspend their own account");
  await repo.updateStatus(db, id, status, nowIso());
  return toResponse(await getOrThrow(db, id));
}

export const avatarUploadUrl = (env: Env, me: CurrentUser, req: AvatarUploadUrlRequest): Promise<UploadUrlResponse> =>
  createUpload(env, `avatars/${me.id}`, req.contentType);
