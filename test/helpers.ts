import { env, SELF } from "cloudflare:test";

const ISSUER = "https://api.asgardeo.io/t/teamcylix/oauth2/token";
const CLIENT_ID = "m3dJhyb5oENx63qGPUVa9LrMpeQa";
const HOUR = 3600 * 1000;

const b64url = (data: string | ArrayBuffer) =>
  btoa(typeof data === "string" ? data : String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

let signingKey: Promise<CryptoKey> | undefined;
const key = () =>
  (signingKey ??= crypto.subtle.importKey(
    "jwk",
    JSON.parse(env.TEST_SIGNING_JWK) as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  ));

type TokenOptions = { header?: Record<string, unknown>; sign?: boolean };

// Asgardeo-style RS256 access token signed with the test key
export async function token(claims: Record<string, unknown> = {}, opts: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid: "test-key", typ: "JWT", ...opts.header }));
  const payload = b64url(JSON.stringify({ iss: ISSUER, aud: CLIENT_ID, iat: now, exp: now + 3600, ...claims }));
  if (opts.sign === false) return `${header}.${payload}.`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await key(), new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export type ApiResult<T = any> = { status: number; body: T; headers: Headers };

export async function api<T = any>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await SELF.fetch(`https://api.test${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body, headers: res.headers };
}

export type TestUser = { id: string; email: string; token: string };

// a new Asgardeo identity, not registered yet
export async function identity(): Promise<{ sub: string; email: string; token: string }> {
  const sub = crypto.randomUUID();
  const email = `u-${sub.slice(0, 8)}@test.dev`;
  return { sub, email, token: await token({ sub, email }) };
}

export async function registered(role: "STUDENT" | "MENTOR", firstName = "Test"): Promise<TestUser> {
  const who = await identity();
  const res = await api("POST", "/api/users/register", { token: who.token, body: { role, firstName, lastName: "User" } });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.id, email: who.email, token: who.token };
}

// admins exist only through the seed migration, so tests insert the row the same way
export async function admin(): Promise<TestUser> {
  const who = await identity();
  await env.DB.prepare(
    "INSERT INTO users (id, external_auth_id, email, first_name, last_name, role) VALUES (?, ?, ?, 'Ad', 'Min', 'ADMIN')",
  )
    .bind(who.sub, who.sub, who.email)
    .run();
  return { id: who.sub, email: who.email, token: who.token };
}

export const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

// whole seconds, as the slot DTO normalises them
const at = (msFromNow: number) => new Date(Math.floor((Date.now() + msFromNow) / 1000) * 1000).toISOString();

export async function slot(mentor: TestUser, startInMs: number, minutes = 60): Promise<string> {
  const start = at(startInMs);
  const end = new Date(Date.parse(start) + minutes * 60_000).toISOString();
  const res = await api("POST", "/api/mentors/me/slots", { token: mentor.token, body: { startTime: start, endTime: end } });
  if (res.status !== 201) throw new Error(`slot failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

// mentor with a profile, an approved verification and one slot two days ahead
export async function approvedMentor(hourlyRateCents = 6000) {
  const mentor = await registered("MENTOR", "Mentor");
  const profile = await api("PUT", "/api/mentors/me", {
    token: mentor.token,
    body: { title: "Engineer", experienceYears: 5, hourlyRateCents },
  });
  const mentorId: string = profile.body.id;
  const doc = await uploadFile(mentor.token, "/api/mentors/me/verification-upload-url", "application/pdf");
  const ver = await api("POST", "/api/mentors/me/verifications", { token: mentor.token, body: { documentKey: doc.key } });
  const adm = await admin();
  await api("PUT", `/api/verifications/${ver.body.id}`, { token: adm.token, body: { status: "APPROVED" } });
  return { mentor, mentorId, admin: adm, slotId: await slot(mentor, 48 * HOUR) };
}

export const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
export const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

// asks the API for an upload url and PUTs the file to (fake) R2
export async function uploadFile(userToken: string, uploadUrlPath: string, contentType: string, bytes?: Uint8Array) {
  const res = await api("POST", uploadUrlPath, { token: userToken, body: { contentType } });
  if (res.status !== 200) throw new Error(`upload url failed: ${res.status} ${JSON.stringify(res.body)}`);
  const put = await fetch(res.body.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes ?? (contentType === "application/pdf" ? PDF : PNG),
  });
  if (put.status !== 200) throw new Error(`R2 PUT failed: ${put.status}`);
  return res.body as { uploadUrl: string; key: string; expiresInSeconds: number };
}

export { HOUR };
