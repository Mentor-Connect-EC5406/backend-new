import { describe, expect, it } from "vitest";
import { admin, api, registered } from "./helpers";

describe("current user", () => {
  it("reads and updates /api/users/me", async () => {
    const user = await registered("STUDENT");
    const upd = await api("PUT", "/api/users/me", { token: user.token, body: { firstName: "New", lastName: "Name", phone: "+94770000000" } });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ firstName: "New", lastName: "Name", phone: "+94770000000" });
    expect((await api("PUT", "/api/users/me", { token: user.token, body: { firstName: "", lastName: "x" } })).status).toBe(400);
  });
});

describe("student profile", () => {
  it("starts empty, updates partially and validates academicYear", async () => {
    const student = await registered("STUDENT");
    const empty = await api("GET", "/api/students/me/profile", { token: student.token });
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ userId: student.id, university: null });

    const full = { university: "University of Ruhuna", faculty: "Engineering", degree: "Computer Engineering", academicYear: 3, bio: "Backend", interests: ["Software"] };
    expect((await api("PUT", "/api/students/me/profile", { token: student.token, body: full })).body.academicYear).toBe(3);
    const partial = await api("PUT", "/api/students/me/profile", { token: student.token, body: { bio: "Updated" } });
    expect(partial.body).toMatchObject({ bio: "Updated", university: "University of Ruhuna" });
    expect((await api("PUT", "/api/students/me/profile", { token: student.token, body: { academicYear: 11 } })).status).toBe(400);
  });

  it("saves the extended sections and keeps the ones not sent", async () => {
    const student = await registered("STUDENT");
    const path = "/api/students/me/profile";
    const empty = await api("GET", path, { token: student.token });
    expect(empty.body).toMatchObject({ headline: "", experience: [], interests: [], skills: [], visibility: { isPublic: false, showEmail: false, showPhone: false } });

    const experience = [{ id: "e1", role: "Intern", organization: "WSO2", startMonth: "2026-01", endMonth: null, description: "Backend" }];
    const visibility = { isPublic: true, showEmail: false, showPhone: false };
    await api("PUT", path, { token: student.token, body: { headline: "Student", experience, skills: ["Java"], visibility } });
    const kept = await api("PUT", path, { token: student.token, body: { location: "Galle" } });
    expect(kept.body).toMatchObject({ headline: "Student", location: "Galle", experience, skills: ["Java"], visibility });

    for (const body of [
      { headline: "x".repeat(121) },
      { bio: "x".repeat(601) },
      { interests: ["a", "b", "c", "d", "e", "f"] },
      { skills: Array(11).fill("a") },
      { experience: [{ ...experience[0], startMonth: "2026-13" }] },
      { links: { linkedin: "javascript:alert(1)", github: "", website: "" } },
    ]) {
      expect((await api("PUT", path, { token: student.token, body })).status).toBe(400);
    }
  });

  it("is for students only", async () => {
    const mentor = await registered("MENTOR");
    expect((await api("GET", "/api/students/me/profile", { token: mentor.token })).status).toBe(403);
  });
});

describe("admin user management", () => {
  it("lists users with filters and pagination", async () => {
    const adm = await admin();
    const mentor = await registered("MENTOR", "Findme");
    const page = await api("GET", "/api/users?role=MENTOR&q=Findme&page=0&size=5", { token: adm.token });
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ page: 0, size: 5 });
    expect(page.body.content.some((u: { id: string }) => u.id === mentor.id)).toBe(true);
    expect((await api("GET", "/api/users?size=101", { token: adm.token })).status).toBe(400);
  });

  it("is admin only", async () => {
    const student = await registered("STUDENT");
    expect((await api("GET", "/api/users", { token: student.token })).status).toBe(403);
    expect((await api("PUT", `/api/users/${student.id}/status`, { token: student.token, body: { accountStatus: "SUSPENDED" } })).status).toBe(403);
  });

  it("does not let an admin suspend themselves and answers 404 for an unknown user", async () => {
    const adm = await admin();
    expect((await api("PUT", `/api/users/${adm.id}/status`, { token: adm.token, body: { accountStatus: "SUSPENDED" } })).status).toBe(409);
    expect((await api("PUT", `/api/users/${crypto.randomUUID()}/status`, { token: adm.token, body: { accountStatus: "SUSPENDED" } })).status).toBe(404);
    expect((await api("PUT", `/api/users/${adm.id}/status`, { token: adm.token, body: { accountStatus: "DELETED" } })).status).toBe(400);
  });
});
