import type { Env } from "../config/env";
import { badRequest } from "../exception/api-error";
import { newId } from "./uuid";

export const UPLOAD_TTL_SECONDS = 300;

export const MB = 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type UploadUrlResponse = { uploadUrl: string; key: string; expiresInSeconds: number };

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const sha256Hex = async (s: string) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));

async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

// RFC 3986 encoding, as SigV4 requires
const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

// AWS SigV4 query signature for the R2 S3 API; content-type is signed so the upload must use the same type
async function presign(env: Env, method: "PUT" | "GET" | "HEAD", key: string, contentType?: string) {
  const host = `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const path = `/${env.R2_BUCKET}/${key.split("/").map(encode).join("/")}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const scope = `${amzDate.slice(0, 8)}/auto/s3/aws4_request`;
  const signedHeaders = contentType ? "content-type;host" : "host";
  const query = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${env.R2_ACCESS_KEY_ID}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(UPLOAD_TTL_SECONDS)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]
    .map(([k, v]) => `${encode(k!)}=${encode(v!)}`)
    .join("&");
  const headers = contentType ? `content-type:${contentType}\nhost:${host}\n` : `host:${host}\n`;
  const canonical = [method, path, query, headers, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n");

  let signingKey = await hmac(enc.encode(`AWS4${env.R2_SECRET_ACCESS_KEY}`), amzDate.slice(0, 8));
  for (const part of ["auto", "s3", "aws4_request"]) signingKey = await hmac(signingKey, part);
  return `https://${host}${path}?${query}&X-Amz-Signature=${toHex(await hmac(signingKey, stringToSign))}`;
}

// new key under the prefix plus a presigned PUT url
export async function createUpload(env: Env, prefix: string, contentType: string): Promise<UploadUrlResponse> {
  const key = `${prefix}/${newId()}.${EXTENSIONS[contentType]}`;
  return { uploadUrl: await presign(env, "PUT", key, contentType), key, expiresInSeconds: UPLOAD_TTL_SECONDS };
}

export const downloadUrl = (env: Env, key: string) => presign(env, "GET", key);

// null when the object does not exist
export async function getObject(env: Env, key: string): Promise<Response | null> {
  const res = await fetch(await presign(env, "GET", key));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET failed with ${res.status}`);
  return res;
}

// 400 when the file was not uploaded or is larger than maxBytes
export async function requireUploaded(env: Env, key: string, field: string, maxBytes: number) {
  const res = await fetch(await presign(env, "HEAD", key), { method: "HEAD" });
  if (res.status === 404) throw badRequest("Validation failed", [{ field, message: "file is not uploaded" }]);
  if (!res.ok) throw new Error(`R2 HEAD failed with ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
    throw badRequest("Validation failed", [{ field, message: `file must be ${maxBytes / MB} MB or smaller` }]);
  }
}
