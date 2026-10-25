import { createMiddleware } from "hono/factory";
import { forbidden, unauthorized } from "../exception/api-error";
import type { Role } from "./current-user";
import type { AppEnv } from "./env";
import { verifyJwt } from "./jwt";

export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) throw unauthorized("Missing bearer token");
  const claims = await verifyJwt(header.slice(7), c.env.JWT_SECRET);

  const row = await c.env.DB.prepare("SELECT account_status FROM users WHERE id = ?")
    .bind(claims.sub)
    .first<{ account_status: string }>();
  if (!row) throw unauthorized("Unknown user");
  if (row.account_status !== "ACTIVE") throw forbidden("Account is not active");

  c.set("user", { id: claims.sub, email: claims.email, role: claims.role });
  await next();
});

export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.get("user").role)) throw forbidden("Insufficient role");
    await next();
  });
