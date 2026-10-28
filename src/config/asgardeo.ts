import { unauthorized } from "../exception/api-error";
import type { Env } from "./env";
import { b64urlDecode } from "./jwt";

export type AsgardeoClaims = {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  email?: string;
};

type Jwk = { kty?: string; kid?: string; n?: string; e?: string; use?: string };

const KEYS_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

let keyCache: { url: string; fetchedAt: number; keys: Map<string, CryptoKey> } | null = null;

const RSA = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;

async function fetchKeys(url: string): Promise<Map<string, CryptoKey>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Asgardeo JWKS request failed with ${res.status}`);
  const { keys = [] } = (await res.json()) as { keys?: Jwk[] };
  const out = new Map<string, CryptoKey>();
  for (const k of keys) {
    if (k.kty !== "RSA" || !k.kid || !k.n || !k.e || (k.use && k.use !== "sig")) continue;
    out.set(k.kid, await crypto.subtle.importKey("jwk", { kty: "RSA", n: k.n, e: k.e, alg: "RS256", ext: true }, RSA, false, ["verify"]));
  }
  return out;
}

// cached keys, refreshed when old or when an unknown kid appears (key rotation)
async function signingKey(env: Env, kid: string): Promise<CryptoKey | undefined> {
  const fresh = keyCache && keyCache.url === env.ASGARDEO_JWKS_URL && Date.now() - keyCache.fetchedAt < KEYS_TTL_MS;
  if (fresh && keyCache!.keys.has(kid)) return keyCache!.keys.get(kid);
  keyCache = { url: env.ASGARDEO_JWKS_URL, fetchedAt: Date.now(), keys: await fetchKeys(env.ASGARDEO_JWKS_URL) };
  return keyCache.keys.get(kid);
}

const decodeJson = <T>(part: string): T => JSON.parse(new TextDecoder().decode(b64urlDecode(part))) as T;

// RS256 access token from Asgardeo: signature by JWKS, then iss, aud, exp and nbf
export async function verifyAsgardeoToken(env: Env, token: string): Promise<AsgardeoClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("Invalid token");
  const [header, payload, sig] = parts as [string, string, string];

  let head: { alg?: string; kid?: string };
  try {
    head = decodeJson(header);
  } catch {
    throw unauthorized("Invalid token");
  }
  if (head.alg !== "RS256" || !head.kid) throw unauthorized("Invalid token");
  // a JWKS outage is a server error, not a bad token
  const key = await signingKey(env, head.kid);
  if (!key) throw unauthorized("Invalid token");

  let claims: AsgardeoClaims;
  try {
    const ok = await crypto.subtle.verify(RSA, key, b64urlDecode(sig), new TextEncoder().encode(`${header}.${payload}`));
    if (!ok) throw new Error("bad signature");
    claims = decodeJson<AsgardeoClaims>(payload);
  } catch {
    throw unauthorized("Invalid token");
  }

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== env.ASGARDEO_ISSUER || !audiences.includes(env.ASGARDEO_CLIENT_ID) || !claims.sub) {
    throw unauthorized("Invalid token");
  }
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) throw unauthorized("Token expired");
  if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SKEW_SECONDS > now) throw unauthorized("Invalid token");
  return claims;
}
