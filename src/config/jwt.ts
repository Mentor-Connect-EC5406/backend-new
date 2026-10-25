import { unauthorized } from "../exception/api-error";
import type { Role } from "./current-user";

export type JwtClaims = { sub: string; email: string; role: Role; exp: number };

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const b64urlDecode = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const hmacKey = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

export const TOKEN_TTL_SECONDS = 24 * 60 * 60;

export async function signJwt(claims: Omit<JwtClaims, "exp">, secret: string): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = b64url(enc.encode(JSON.stringify({ ...claims, exp })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("Invalid token");
  const [header, payload, sig] = parts as [string, string, string];
  let claims: JwtClaims;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      b64urlDecode(sig),
      enc.encode(`${header}.${payload}`),
    );
    if (!ok) throw new Error("bad signature");
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as JwtClaims;
  } catch {
    throw unauthorized("Invalid token");
  }
  if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) {
    throw unauthorized("Token expired");
  }
  if (!claims.sub || !claims.email || !claims.role) throw unauthorized("Invalid token");
  return claims;
}
