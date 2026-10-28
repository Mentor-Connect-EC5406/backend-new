import { createMiddleware } from "hono/factory";
import { type ApiError, forbidden, notFound, unauthorized } from "../exception/api-error";
import { verifyAsgardeoToken } from "./asgardeo";
import type { Identity, Role } from "./current-user";
import type { AppEnv, Env } from "./env";

// only Asgardeo access tokens are accepted
async function identify(env: Env, header: string | undefined): Promise<Identity> {
  if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
  const claims = await verifyAsgardeoToken(env, header.slice(7));
  return { sub: claims.sub, email: claims.email ?? null };
}

// valid token, users row not needed (POST /api/users/register)
export const authenticateIdentity = createMiddleware<AppEnv>(async (c, next) => {
  c.set("identity", await identify(c.env, c.req.header("Authorization")));
  await next();
});

// valid token and a registered ACTIVE user; the role comes from the database
const authenticateUser = (unregistered: () => ApiError) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const identity = await identify(c.env, c.req.header("Authorization"));
    const row = await c.env.DB.prepare("SELECT id, email, role, account_status FROM users WHERE external_auth_id = ?")
      .bind(identity.sub)
      .first<{ id: string; email: string; role: Role; account_status: string }>();
    if (!row) throw unregistered();
    if (row.account_status !== "ACTIVE") throw forbidden("Account is not active");
    c.set("identity", identity);
    c.set("user", { id: row.id, email: row.email, role: row.role });
    await next();
  });

export const authenticate = authenticateUser(() => forbidden("User is not registered, call POST /api/users/register"));

// GET /api/users/me answers 404 so the frontend knows to call register
export const authenticateMe = authenticateUser(() => notFound("User is not registered"));

export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.get("user").role)) throw forbidden("Insufficient role");
    await next();
  });
