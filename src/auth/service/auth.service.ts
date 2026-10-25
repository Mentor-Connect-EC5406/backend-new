import { signJwt } from "../../config/jwt";
import type { Env } from "../../config/env";
import { conflict, forbidden, unauthorized } from "../../exception/api-error";
import { hashPassword, verifyPassword } from "../../util/password";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type { AuthResponse, LoginRequest, RegisterRequest, UserResponse } from "../dto/auth.dto";
import type { AuthUserRow } from "../entity/auth-user.entity";
import * as repo from "../repository/auth.repository";

const toResponse = (r: AuthUserRow): UserResponse => ({
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

const issue = async (env: Env, r: AuthUserRow): Promise<AuthResponse> => ({
  token: await signJwt({ sub: r.id, email: r.email, role: r.role }, env.JWT_SECRET),
  user: toResponse(r),
});

export async function register(env: Env, req: RegisterRequest): Promise<AuthResponse> {
  if (await repo.findByEmail(env.DB, req.email)) throw conflict("Email is already registered");
  const id = newId();
  try {
    await repo.insertUser(
      env.DB,
      {
        id,
        email: req.email,
        passwordHash: await hashPassword(req.password),
        firstName: req.firstName,
        lastName: req.lastName,
        phone: req.phone ?? null,
        role: req.role,
        now: nowIso(),
      },
      req.role === "STUDENT" ? newId() : null,
    );
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw conflict("Email is already registered");
    throw e;
  }
  const row = await repo.findById(env.DB, id);
  return issue(env, row!);
}

export async function login(env: Env, req: LoginRequest): Promise<AuthResponse> {
  const row = await repo.findByEmail(env.DB, req.email);
  if (!row || !(await verifyPassword(req.password, row.password_hash))) {
    throw unauthorized("Invalid email or password");
  }
  if (row.account_status !== "ACTIVE") throw forbidden("Account is not active");
  return issue(env, row);
}
