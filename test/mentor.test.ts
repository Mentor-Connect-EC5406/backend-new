import { describe, expect, it } from "vitest";
import { admin, api, approvedMentor, HOUR, registered, slot, uploadFile } from "./helpers";

describe("mentor profile and approval", () => {
  it("creates a PENDING profile that students cannot find or book", async () => {
    const mentor = await registered("MENTOR");
    const profile = await api("PUT", "/api/mentors/me", { token: mentor.token, body: { title: "Engineer", experienceYears: 2, hourlyRateCents: 4000 } });
    expect(profile.status).toBe(201);
    expect(profile.body.verificationStatus).toBe("PENDING");
    expect((await api("PUT", "/api/mentors/me", { token: mentor.token, body: { title: "Senior", experienceYears: 3, hourlyRateCents: 4000 } })).status).toBe(200);

    const student = await registered("STUDENT");
    expect((await api("GET", `/api/mentors/${profile.body.id}`, { token: student.token })).status).toBe(404);
    expect((await api("GET", `/api/mentors/${profile.body.id}/slots`, { token: student.token })).status).toBe(404);
    const slotId = await slot(mentor, 48 * HOUR);
    expect((await api("POST", "/api/bookings", { token: student.token, body: { slotId } })).status).toBe(409);
  });

  it("becomes visible after an admin approves the verification", async () => {
    const { mentorId } = await approvedMentor();
    const student = await registered("STUDENT");
    const view = await api("GET", `/api/mentors/${mentorId}`, { token: student.token });
    expect(view.status).toBe(200);
    expect(view.body.verificationStatus).toBe("APPROVED");
    const slots = await api("GET", `/api/mentors/${mentorId}/slots`, { token: student.token });
    expect(slots.body).toHaveLength(1);
  });

  it("needs a profile for mentor routes", async () => {
    const mentor = await registered("MENTOR");
    expect((await api("GET", "/api/mentors/me", { token: mentor.token })).status).toBe(404);
  });
});

describe("verification", () => {
  it("submits once while PENDING and is reviewed once", async () => {
    const mentor = await registered("MENTOR");
    const { body: profile } = await api("PUT", "/api/mentors/me", { token: mentor.token, body: { title: "E", experienceYears: 1, hourlyRateCents: 1000 } });
    const doc = await uploadFile(mentor.token, "/api/mentors/me/verification-upload-url", "application/pdf");
    expect(doc.key.startsWith(`verifications/${profile.id}/`)).toBe(true);

    const ver = await api("POST", "/api/mentors/me/verifications", { token: mentor.token, body: { documentKey: doc.key } });
    expect(ver.status).toBe(201);
    expect((await api("POST", "/api/mentors/me/verifications", { token: mentor.token, body: { documentKey: doc.key } })).status).toBe(409);
    expect((await api("GET", "/api/mentors/me/verifications", { token: mentor.token })).body).toHaveLength(1);

    const adm = await admin();
    expect((await api("PUT", `/api/verifications/${ver.body.id}`, { token: adm.token, body: { status: "REJECTED" } })).status).toBe(400);
    expect((await api("PUT", `/api/verifications/${ver.body.id}`, { token: adm.token, body: { status: "REJECTED", reviewNote: "Unclear" } })).status).toBe(200);
    expect((await api("PUT", `/api/verifications/${ver.body.id}`, { token: adm.token, body: { status: "APPROVED" } })).status).toBe(409);
    expect((await api("PUT", `/api/verifications/${crypto.randomUUID()}`, { token: adm.token, body: { status: "APPROVED" } })).status).toBe(404);
  });

  it("rejects a key outside the mentor folder and admin routes for mentors", async () => {
    const mentor = await registered("MENTOR");
    await api("PUT", "/api/mentors/me", { token: mentor.token, body: { title: "E", experienceYears: 1, hourlyRateCents: 1000 } });
    expect((await api("POST", "/api/mentors/me/verifications", { token: mentor.token, body: { documentKey: "wrong/a.pdf" } })).status).toBe(400);
    expect((await api("GET", "/api/verifications", { token: mentor.token })).status).toBe(403);
  });
});

describe("expertise and search", () => {
  it("lets admins build the taxonomy and mentors pick from it", async () => {
    const adm = await admin();
    const { mentor, mentorId } = await approvedMentor();
    const cat = await api("POST", "/api/expertise-categories", { token: adm.token, body: { name: `Software ${Date.now()}` } });
    expect(cat.status).toBe(201);
    const exp = await api("POST", `/api/expertise-categories/${cat.body.id}/expertises`, { token: adm.token, body: { name: "Java" } });
    expect(exp.status).toBe(201);
    expect((await api("POST", "/api/expertise-categories", { token: mentor.token, body: { name: "x" } })).status).toBe(403);

    const set = await api("PUT", "/api/mentors/me/expertises", { token: mentor.token, body: { expertises: [{ expertiseId: exp.body.id, proficiency: "EXPERT" }] } });
    expect(set.status).toBe(200);

    const student = await registered("STUDENT");
    const found = await api("GET", `/api/mentors?expertiseId=${exp.body.id}`, { token: student.token });
    expect(found.body.content.map((m: { id: string }) => m.id)).toContain(mentorId);
    expect((await api("GET", "/api/mentors", { token: mentor.token })).status).toBe(403);
    expect((await api("GET", "/api/expertise-categories", { token: student.token })).status).toBe(200);
  });
});

describe("availability slots", () => {
  it("creates, edits, blocks and deletes free slots", async () => {
    const { mentor } = await approvedMentor();
    const slotId = await slot(mentor, 72 * HOUR);
    const own = await api("GET", "/api/mentors/me/slots", { token: mentor.token });
    expect(own.body.some((s: { id: string }) => s.id === slotId)).toBe(true);

    const s = own.body.find((x: { id: string }) => x.id === slotId);
    const blocked = await api("PUT", `/api/mentors/me/slots/${slotId}`, { token: mentor.token, body: { startTime: s.startTime, endTime: s.endTime, status: "BLOCKED" } });
    expect(blocked.body.status).toBe("BLOCKED");
    expect((await api("DELETE", `/api/mentors/me/slots/${slotId}`, { token: mentor.token })).status).toBe(204);
  });

  it("rejects a duplicate start time and an end before the start", async () => {
    const { mentor } = await approvedMentor();
    const start = new Date(Math.floor((Date.now() + 96 * HOUR) / 1000) * 1000).toISOString();
    const end = new Date(Date.parse(start) + HOUR).toISOString();
    expect((await api("POST", "/api/mentors/me/slots", { token: mentor.token, body: { startTime: start, endTime: end } })).status).toBe(201);
    expect((await api("POST", "/api/mentors/me/slots", { token: mentor.token, body: { startTime: start, endTime: end } })).status).toBe(409);
    expect((await api("POST", "/api/mentors/me/slots", { token: mentor.token, body: { startTime: end, endTime: start } })).status).toBe(400);
  });
});
