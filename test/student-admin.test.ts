import { describe, expect, it } from "vitest";
import { admin, api, approvedMentor, registered } from "./helpers";

describe("saved mentors", () => {
  it("saves twice without error, lists and removes", async () => {
    const { mentorId } = await approvedMentor();
    const student = await registered("STUDENT");
    const path = `/api/students/me/saved-mentors/${mentorId}`;
    expect((await api("PUT", path, { token: student.token })).status).toBe(204);
    expect((await api("PUT", path, { token: student.token })).status).toBe(204);

    const list = await api("GET", "/api/students/me/saved-mentors", { token: student.token });
    expect(list.body.totalElements).toBe(1);
    expect(list.body.content[0].id).toBe(mentorId);

    expect((await api("DELETE", path, { token: student.token })).status).toBe(204);
    expect((await api("DELETE", path, { token: student.token })).status).toBe(204);
    expect((await api("GET", "/api/students/me/saved-mentors", { token: student.token })).body.content).toEqual([]);
  });

  it("checks the mentor and the role", async () => {
    const { mentor, mentorId } = await approvedMentor();
    const student = await registered("STUDENT");
    expect((await api("PUT", `/api/students/me/saved-mentors/${crypto.randomUUID()}`, { token: student.token })).status).toBe(404);
    expect((await api("PUT", `/api/students/me/saved-mentors/${mentorId}`, { token: mentor.token })).status).toBe(403);
    expect((await api("GET", "/api/students/me/saved-mentors")).status).toBe(401);

    const pending = await registered("MENTOR");
    const { body: profile } = await api("PUT", "/api/mentors/me", { token: pending.token, body: { title: "E", experienceYears: 1 } });
    expect((await api("PUT", `/api/students/me/saved-mentors/${profile.id}`, { token: student.token })).status).toBe(404);
  });
});

describe("goals", () => {
  it("creates, updates part of a goal and deletes it", async () => {
    const student = await registered("STUDENT");
    const created = await api("POST", "/api/goals", { token: student.token, body: { title: "Learn Java", targetDate: "2027-06-30" } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ title: "Learn Java", targetDate: "2027-06-30", progress: 0 });

    const path = `/api/goals/${created.body.id}`;
    const patched = await api("PATCH", path, { token: student.token, body: { progress: 40 } });
    expect(patched.body).toMatchObject({ title: "Learn Java", targetDate: "2027-06-30", progress: 40 });
    expect((await api("PATCH", path, { token: student.token, body: { targetDate: null } })).body.targetDate).toBeNull();

    expect((await api("GET", "/api/goals", { token: student.token })).body.totalElements).toBe(1);
    expect((await api("DELETE", path, { token: student.token })).status).toBe(204);
    expect((await api("DELETE", path, { token: student.token })).status).toBe(404);
  });

  it("validates and protects other students' goals", async () => {
    const student = await registered("STUDENT");
    const other = await registered("STUDENT");
    const mentor = await registered("MENTOR");
    const { body: goal } = await api("POST", "/api/goals", { token: student.token, body: { title: "Goal" } });
    const path = `/api/goals/${goal.id}`;

    for (const body of [{ title: "" }, { title: "x".repeat(101) }, { title: "G", progress: 101 }, { title: "G", targetDate: "2027-13-01" }]) {
      expect((await api("POST", "/api/goals", { token: student.token, body })).status).toBe(400);
    }
    expect((await api("PATCH", path, { token: other.token, body: { progress: 1 } })).status).toBe(404);
    expect((await api("DELETE", path, { token: other.token })).status).toBe(404);
    expect((await api("GET", "/api/goals", { token: mentor.token })).status).toBe(403);
    expect((await api("GET", "/api/goals")).status).toBe(401);
  });
});

describe("reports", () => {
  it("is submitted by a user and closed once by an admin", async () => {
    const student = await registered("STUDENT");
    const { mentor } = await approvedMentor();
    const adm = await admin();
    const created = await api("POST", "/api/reports", { token: student.token, body: { reportedUserId: mentor.id, category: "NO_SHOW", description: "Mentor did not join" } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "OPEN", reportedBy: student.id, reporterName: "Test User", reportedUserId: mentor.id });

    expect((await api("GET", "/api/reports/mine", { token: student.token })).body.totalElements).toBe(1);
    expect((await api("GET", "/api/reports/mine", { token: mentor.token })).body.totalElements).toBe(0);
    const open = await api("GET", "/api/reports?status=OPEN", { token: adm.token });
    expect(open.body.content.map((r: { id: string }) => r.id)).toContain(created.body.id);

    const path = `/api/reports/${created.body.id}`;
    expect((await api("GET", path, { token: student.token })).status).toBe(403);
    expect((await api("PUT", path, { token: student.token, body: { status: "UNDER_REVIEW" } })).status).toBe(403);
    expect((await api("PUT", path, { token: adm.token, body: { status: "RESOLVED" } })).status).toBe(400);
    expect((await api("PUT", path, { token: adm.token, body: { status: "UNDER_REVIEW", assignedAdminId: student.id } })).status).toBe(400);

    const review = await api("PUT", path, { token: adm.token, body: { status: "UNDER_REVIEW" } });
    expect(review.body).toMatchObject({ status: "UNDER_REVIEW", assignedAdminId: adm.id, resolvedAt: null });
    const closed = await api("PUT", path, { token: adm.token, body: { status: "DISMISSED", resolution: "No evidence" } });
    expect(closed.body.status).toBe("DISMISSED");
    expect(closed.body.resolvedAt).not.toBeNull();
    expect((await api("PUT", path, { token: adm.token, body: { status: "UNDER_REVIEW" } })).status).toBe(409);
    expect((await api("GET", path, { token: adm.token })).body.resolution).toBe("No evidence");
    expect((await api("GET", `/api/reports/${crypto.randomUUID()}`, { token: adm.token })).status).toBe(404);
  });

  it("validates the body and the linked records", async () => {
    const student = await registered("STUDENT");
    const send = (body: object) => api("POST", "/api/reports", { token: student.token, body });
    expect((await send({ category: "SPAM", description: "x" })).status).toBe(400);
    expect((await send({ category: "OTHER" })).status).toBe(400);
    expect((await send({ category: "OTHER", description: "x".repeat(2001) })).status).toBe(400);
    expect((await send({ category: "OTHER", description: "x", reportedUserId: student.id })).status).toBe(400);
    expect((await send({ category: "OTHER", description: "x", reportedUserId: crypto.randomUUID() })).status).toBe(404);
    expect((await send({ category: "OTHER", description: "x", bookingId: crypto.randomUUID() })).status).toBe(404);
    expect((await api("POST", "/api/reports", { body: { category: "OTHER", description: "x" } })).status).toBe(401);
    expect((await api("GET", "/api/reports", { token: student.token })).status).toBe(403);
  });
});

describe("admin stats", () => {
  it("counts for admins only", async () => {
    const { mentor } = await approvedMentor();
    const adm = await admin();
    const stats = await api("GET", "/api/admin/stats", { token: adm.token });
    expect(stats.status).toBe(200);
    expect(stats.body.mentors).toBeGreaterThanOrEqual(1);
    expect(stats.body.users).toBeGreaterThanOrEqual(2);
    expect(stats.body).toMatchObject({ revenueCents: 0, currency: "LKR" });
    expect((await api("GET", "/api/admin/stats", { token: mentor.token })).status).toBe(403);
    expect((await api("GET", "/api/admin/stats")).status).toBe(401);
  });
});
