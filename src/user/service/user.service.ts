import type { CurrentUser } from "../../config/current-user";
import { conflict, notFound } from "../../exception/api-error";
import { type Page, toPage } from "../../util/pagination";
import { nowIso } from "../../util/time";
import type { ListUsersQuery, UpdateMeRequest, UploadUrlResponse, UserResponse } from "../dto/user.dto";
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

export async function getMe(db: D1Database, me: CurrentUser): Promise<UserResponse> {
  return toResponse(await getOrThrow(db, me.id));
}

export async function updateMe(db: D1Database, me: CurrentUser, req: UpdateMeRequest): Promise<UserResponse> {
  await getOrThrow(db, me.id);
  await repo.updateProfile(db, me.id, req, nowIso());
  return toResponse(await getOrThrow(db, me.id));
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

// R2 comes later
export const avatarUploadUrl = (): UploadUrlResponse => ({ uploadUrl: null, key: null });
