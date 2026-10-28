import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import { defineConfig } from "vitest/config";

// test-only signing key: tests sign Asgardeo-style tokens, the fake JWKS below publishes the public half
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-key";
const JWKS_URL = "https://asgardeo.test/oauth2/jwks";

const R2 = { account: "testaccount", bucket: "test-bucket", keyId: "test-key-id", secret: "test-secret" };
const R2_HOST = `${R2.account}.r2.cloudflarestorage.com`;
const objects = new Map<string, { body: Uint8Array; type: string }>();

const hex = (b: Buffer) => b.toString("hex");
const encode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);

// independent SigV4 check of a presigned R2 url, so a wrong signature fails like real R2 (403)
function validSignature(req: Request, url: URL): boolean {
  const q = url.searchParams;
  const amzDate = q.get("X-Amz-Date") ?? "";
  const signedHeaders = q.get("X-Amz-SignedHeaders") ?? "";
  const expires = Number(q.get("X-Amz-Expires"));
  const signedAt = Date.UTC(+amzDate.slice(0, 4), +amzDate.slice(4, 6) - 1, +amzDate.slice(6, 8), +amzDate.slice(9, 11), +amzDate.slice(11, 13), +amzDate.slice(13, 15));
  if (!amzDate || Date.now() > signedAt + expires * 1000) return false;
  const query = [...q.entries()].filter(([k]) => k !== "X-Amz-Signature").map(([k, v]) => `${encode(k)}=${encode(v)}`).sort().join("&");
  const headers = signedHeaders.split(";").map((h) => `${h}:${h === "host" ? url.host : req.headers.get(h) ?? ""}\n`).join("");
  const canonical = [req.method, url.pathname, query, headers, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const scope = `${amzDate.slice(0, 8)}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, hex(createHash("sha256").update(canonical).digest())].join("\n");
  let key: Buffer = createHmac("sha256", `AWS4${R2.secret}`).update(amzDate.slice(0, 8)).digest();
  for (const part of ["auto", "s3", "aws4_request"]) key = createHmac("sha256", key).update(part).digest();
  return hex(createHmac("sha256", key).update(toSign).digest()) === q.get("X-Amz-Signature");
}

// every fetch() made by the Worker or the tests lands here: fake Asgardeo JWKS and an in-memory R2
async function outbound(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.href === JWKS_URL) {
    const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, use: "sig", alg: "RS256" };
    return Response.json({ keys: [jwk] });
  }
  if (url.host === R2_HOST) {
    if (!validSignature(req, url)) return new Response("SignatureDoesNotMatch", { status: 403 });
    const key = decodeURIComponent(url.pathname.replace(`/${R2.bucket}/`, ""));
    if (req.method === "PUT") {
      objects.set(key, { body: new Uint8Array(await req.arrayBuffer()), type: req.headers.get("content-type") ?? "" });
      return new Response(null, { status: 200 });
    }
    const object = objects.get(key);
    if (!object) return new Response(null, { status: 404 });
    const headers = { "content-type": object.type, "content-length": String(object.body.byteLength) };
    return new Response(req.method === "HEAD" ? null : object.body, { headers });
  }
  return new Response(`unexpected outbound request ${req.method} ${url.href}`, { status: 599 });
}

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        outboundService: outbound,
        bindings: {
          ASGARDEO_JWKS_URL: JWKS_URL,
          R2_ACCOUNT_ID: R2.account,
          R2_BUCKET: R2.bucket,
          R2_ACCESS_KEY_ID: R2.keyId,
          R2_SECRET_ACCESS_KEY: R2.secret,
          TEST_SIGNING_JWK: JSON.stringify({ ...privateKey.export({ format: "jwk" }), kid: KID }),
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});
