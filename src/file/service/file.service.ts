import type { CurrentUser } from "../../config/current-user";
import type { Env } from "../../config/env";
import { forbidden, notFound } from "../../exception/api-error";
import { getObject } from "../../util/r2";
import * as repo from "../repository/file.repository";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

// only keys created by the upload-url endpoints
const KEY_PATTERN = new RegExp(`^(avatars|verifications|attachments)/(${UUID})/${UUID}\\.(jpg|png|webp|pdf)$`);

// avatars are public; verifications go to the admin and the mentor; attachments to participants
export async function serveFile(env: Env, user: CurrentUser | null, key: string): Promise<Response> {
  const match = KEY_PATTERN.exec(key);
  if (!match) throw notFound("File not found");
  const [, folder, ownerId] = match as unknown as [string, string, string];

  if (folder === "verifications" && user?.role !== "ADMIN" && !(user && (await repo.isOwnMentor(env.DB, ownerId, user.id)))) {
    throw forbidden("Not allowed to read this file");
  }
  if (folder === "attachments" && !(user && (await repo.isParticipant(env.DB, ownerId, user.id)))) {
    throw forbidden("Not allowed to read this file");
  }

  const object = await getObject(env, key);
  if (!object) throw notFound("File not found");
  const headers = new Headers({
    "Content-Type": object.headers.get("content-type") ?? "application/octet-stream",
    // keys never change, so public avatars can be cached
    "Cache-Control": folder === "avatars" ? "public, max-age=86400, immutable" : "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const length = object.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(object.body, { headers });
}
