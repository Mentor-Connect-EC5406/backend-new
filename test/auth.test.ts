import { describe, expect, it } from "vitest";
import { admin, api, identity, registered, token } from "./helpers";

describe("Asgardeo token checks", () => {
  it("rejects a request without a token", async () => {
    expect((await api("GET", "/api/users/me")).status).toBe(401);
  });

  it.each([
    ["expired", { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ["wrong audience", { aud: "another-client" }],
    ["wrong issuer", { iss: "https://api.asgardeo.io/t/evil/oauth2/token" }],
    ["not valid yet", { nbf: Math.floor(Date.now() / 1000) + 3600 }],
  ])("rejects a token that is %s", async (_name, claims) => {
    const t = await token({ sub: crypto.randomUUID(), email: "a@test.dev", ...claims });
    expect((await api("GET", "/api/users/me", { token: t })).status).toBe(401);
  });

  it("rejects an unknown key id, alg none, HS256 and garbage", async () => {
    const sub = crypto.randomUUID();
    const unknownKid = await token({ sub }, { header: { kid: "other-key" } });
    const none = await token({ sub }, { header: { alg: "none" }, sign: false });
    const hs256 = (await token({ sub }, { header: { alg: "HS256" } })).replace(/\.[^.]+$/, ".c2lnbmF0dXJl");
    for (const t of [unknownKid, none, hs256, "abc.def", "not-a-token"]) {
      expect((await api("GET", "/api/users/me", { token: t })).status).toBe(401);
    }
  });

  it("rejects a token whose payload was changed after signing", async () => {
    const t = await token({ sub: crypto.randomUUID() });
    const [h, , s] = t.split(".");
    const forged = btoa(JSON.stringify({ sub: crypto.randomUUID(), iss: "x" })).replace(/=+$/, "");
    expect((await api("GET", "/api/users/me", { token: `${h}.${forged}.${s}` })).status).toBe(401);
  });

  it("accepts aud given as an array that contains the client id", async () => {
    const user = await registered("STUDENT");
    const sub = user.id;
    const t = await token({ sub, aud: ["other", "m3dJhyb5oENx63qGPUVa9LrMpeQa"] });
    expect((await api("GET", "/api/users/me", { token: t })).status).toBe(200);
  });

  it("has no password login routes", async () => {
    const body = { email: "a@test.dev", password: "Passw0rd!", role: "STUDENT", firstName: "a", lastName: "b" };
    expect((await api("POST", "/api/auth/login", { body })).status).toBe(404);
    expect((await api("POST", "/api/auth/register", { body })).status).toBe(404);
  });
});

describe("first login and POST /api/users/register", () => {
  it("returns 404 on /me and 403 elsewhere before register", async () => {
    const who = await identity();
    const me = await api("GET", "/api/users/me", { token: who.token });
    expect(me.status).toBe(404);
    expect(me.body.message).toContain("not registered");
    expect((await api("GET", "/api/bookings", { token: who.token })).status).toBe(403);
  });

  it("creates the user with id = sub and the email from the token", async () => {
    const who = await identity();
    const res = await api("POST", "/api/users/register", {
      token: who.token,
      body: { role: "STUDENT", firstName: "Kamal", lastName: "Perera", phone: "+94771234567" },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: who.sub, email: who.email, role: "STUDENT", accountStatus: "ACTIVE" });
    expect((await api("GET", "/api/users/me", { token: who.token })).body.firstName).toBe("Kamal");
    expect((await api("GET", "/api/students/me/profile", { token: who.token })).status).toBe(200);
  });

  it("validates the body and the email claim", async () => {
    const who = await identity();
    expect((await api("POST", "/api/users/register", { body: { role: "STUDENT", firstName: "a", lastName: "b" } })).status).toBe(401);
    const asAdmin = await api("POST", "/api/users/register", { token: who.token, body: { role: "ADMIN", firstName: "a", lastName: "b" } });
    expect(asAdmin.status).toBe(400);
    expect(asAdmin.body.fieldErrors[0].field).toBe("role");
    expect((await api("POST", "/api/users/register", { token: who.token, body: { role: "STUDENT", firstName: " ", lastName: "" } })).status).toBe(400);
    const noEmail = await api("POST", "/api/users/register", {
      token: await token({ sub: crypto.randomUUID() }),
      body: { role: "STUDENT", firstName: "a", lastName: "b" },
    });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.fieldErrors[0].field).toBe("email");
  });

  it("answers 409 for a second register or a taken email", async () => {
    const user = await registered("MENTOR");
    const again = await api("POST", "/api/users/register", { token: user.token, body: { role: "MENTOR", firstName: "a", lastName: "b" } });
    expect(again.status).toBe(409);
    const sameEmail = await token({ sub: crypto.randomUUID(), email: user.email });
    expect((await api("POST", "/api/users/register", { token: sameEmail, body: { role: "STUDENT", firstName: "a", lastName: "b" } })).status).toBe(409);
  });

  it("gives a non-uuid sub a new uuid id and still finds the user", async () => {
    const sub = `google-oauth-${Date.now()}`;
    const t = await token({ sub, email: `odd-${Date.now()}@test.dev` });
    const res = await api("POST", "/api/users/register", { token: t, body: { role: "STUDENT", firstName: "a", lastName: "b" } });
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await api("GET", "/api/users/me", { token: t })).status).toBe(200);
  });
});

describe("roles and status come from the database", () => {
  it("blocks a suspended user and lets them back in after reactivation", async () => {
    const adm = await admin();
    const user = await registered("STUDENT");
    expect((await api("PUT", `/api/users/${user.id}/status`, { token: adm.token, body: { accountStatus: "SUSPENDED" } })).status).toBe(200);
    expect((await api("GET", "/api/users/me", { token: user.token })).status).toBe(403);
    await api("PUT", `/api/users/${user.id}/status`, { token: adm.token, body: { accountStatus: "ACTIVE" } });
    expect((await api("GET", "/api/users/me", { token: user.token })).status).toBe(200);
  });

  it("ignores a role claim in the token", async () => {
    const user = await registered("STUDENT");
    const t = await token({ sub: user.id, email: user.email, role: "ADMIN" });
    expect((await api("GET", "/api/users", { token: t })).status).toBe(403);
  });

  it("uses the seeded admin", async () => {
    const adm = await admin();
    const me = await api("GET", "/api/users/me", { token: adm.token });
    expect(me.body.role).toBe("ADMIN");
    expect((await api("POST", "/api/users/register", { token: adm.token, body: { role: "STUDENT", firstName: "a", lastName: "b" } })).status).toBe(409);
  });
});
