import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { admin, api, PDF, PNG, registered, uploadFile } from "./helpers";

const getFile = (key: string, token?: string) =>
  SELF.fetch(`https://api.test/api/files/${key}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("avatar upload", () => {
  it("gives a presigned url, saves the key and serves the image without a token", async () => {
    const user = await registered("STUDENT");
    const up = await uploadFile(user.token, "/api/users/me/avatar-upload-url", "image/png");
    expect(up.key).toMatch(new RegExp(`^avatars/${user.id}/[0-9a-f-]{36}\\.png$`));
    expect(up.expiresInSeconds).toBe(300);

    const saved = await api("PUT", "/api/users/me", { token: user.token, body: { firstName: "A", lastName: "B", profileImageKey: up.key } });
    expect(saved.body.profileImageKey).toBe(up.key);

    const img = await getFile(up.key);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toContain("public");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
  });

  it("checks the content type, the owner, the upload and the size", async () => {
    const user = await registered("STUDENT");
    const other = await registered("STUDENT");
    expect((await api("POST", "/api/users/me/avatar-upload-url", { token: user.token, body: { contentType: "image/gif" } })).status).toBe(400);
    expect((await api("POST", "/api/users/me/avatar-upload-url", { body: { contentType: "image/png" } })).status).toBe(401);

    const res = await api("POST", "/api/users/me/avatar-upload-url", { token: user.token, body: { contentType: "image/png" } });
    const wrongType = await fetch(res.body.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: PNG });
    expect(wrongType.status).toBe(403);

    const save = (key: string) => api("PUT", "/api/users/me", { token: user.token, body: { firstName: "A", lastName: "B", profileImageKey: key } });
    expect((await save(`avatars/${other.id}/${crypto.randomUUID()}.png`)).status).toBe(400);
    expect((await save(`avatars/${user.id}/${crypto.randomUUID()}.png`)).status).toBe(400);

    const big = await uploadFile(user.token, "/api/users/me/avatar-upload-url", "image/png", new Uint8Array(6 * 1024 * 1024));
    const tooBig = await save(big.key);
    expect(tooBig.status).toBe(400);
    expect(JSON.stringify(tooBig.body)).toContain("5 MB");
  });
});

describe("verification documents", () => {
  it("needs a mentor profile and an allowed type", async () => {
    const mentor = await registered("MENTOR");
    expect((await api("POST", "/api/mentors/me/verification-upload-url", { token: mentor.token, body: { contentType: "application/pdf" } })).status).toBe(404);
    await api("PUT", "/api/mentors/me", { token: mentor.token, body: { title: "E", experienceYears: 1, hourlyRateCents: 1000 } });
    expect((await api("POST", "/api/mentors/me/verification-upload-url", { token: mentor.token, body: { contentType: "text/plain" } })).status).toBe(400);
    const student = await registered("STUDENT");
    expect((await api("POST", "/api/mentors/me/verification-upload-url", { token: student.token, body: { contentType: "application/pdf" } })).status).toBe(403);
  });

  it("must be uploaded before submit and is readable by the admin and the owner only", async () => {
    const mentor = await registered("MENTOR");
    await api("PUT", "/api/mentors/me", { token: mentor.token, body: { title: "E", experienceYears: 1, hourlyRateCents: 1000 } });
    const res = await api("POST", "/api/mentors/me/verification-upload-url", { token: mentor.token, body: { contentType: "application/pdf" } });
    expect((await api("POST", "/api/mentors/me/verifications", { token: mentor.token, body: { documentKey: res.body.key } })).status).toBe(400);
    await fetch(res.body.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: PDF });
    expect((await api("POST", "/api/mentors/me/verifications", { token: mentor.token, body: { documentKey: res.body.key } })).status).toBe(201);

    const adm = await admin();
    const list = await api("GET", "/api/verifications?status=PENDING", { token: adm.token });
    const item = list.body.content.find((v: { documentKey: string }) => v.documentKey === res.body.key);
    expect(item.documentUrl).toContain("X-Amz-Expires=300");
    const download = await fetch(item.documentUrl);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(PDF);

    expect((await getFile(res.body.key)).status).toBe(401);
    expect((await getFile(res.body.key, (await registered("STUDENT")).token)).status).toBe(403);
    expect((await getFile(res.body.key, mentor.token)).status).toBe(200);
    expect((await getFile(res.body.key, adm.token)).status).toBe(200);
  });
});

describe("chat attachments", () => {
  it("live in the conversation folder and are readable by participants only", async () => {
    const a = await registered("STUDENT");
    const b = await registered("MENTOR");
    const outsider = await registered("STUDENT");
    const { body: chat } = await api("POST", "/api/conversations", { token: a.token, body: { participantId: b.id } });
    const path = `/api/conversations/${chat.id}/attachment-upload-url`;
    expect((await api("POST", path, { token: a.token })).status).toBe(400);
    expect((await api("POST", path, { token: outsider.token, body: { contentType: "image/png" } })).status).toBe(403);

    const res = await api("POST", path, { token: a.token, body: { contentType: "image/png" } });
    expect(res.body.key.startsWith(`attachments/${chat.id}/`)).toBe(true);
    const send = (key: string) => api("POST", `/api/conversations/${chat.id}/messages`, { token: a.token, body: { content: "pic", attachmentKey: key } });
    expect((await send(res.body.key)).status).toBe(400);
    await fetch(res.body.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: PNG });
    expect((await send(`attachments/${crypto.randomUUID()}/${crypto.randomUUID()}.png`)).status).toBe(400);
    const msg = await send(res.body.key);
    expect(msg.status).toBe(201);
    expect(msg.body.attachmentKey).toBe(res.body.key);

    expect((await getFile(res.body.key, b.token)).status).toBe(200);
    expect((await getFile(res.body.key, outsider.token)).status).toBe(403);
    expect((await getFile(res.body.key, (await admin()).token)).status).toBe(403);
  });
});

describe("file route", () => {
  it("answers 404 for unknown or malformed keys", async () => {
    const user = await registered("STUDENT");
    expect((await getFile(`avatars/${user.id}/${crypto.randomUUID()}.png`)).status).toBe(404);
    expect((await getFile("secrets/passwords.txt", user.token)).status).toBe(404);
  });
});
