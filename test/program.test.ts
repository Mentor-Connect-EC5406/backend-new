import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { addMonths } from "../src/mentorship/service/program.service";
import { admin, api, approvedMentor, registered, type TestUser } from "./helpers";

const day = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86400_000).toISOString().slice(0, 10);

const titles = async (user: TestUser) =>
  (await api("GET", "/api/notifications", { token: user.token })).body.content.map((n: { title: string }) => n.title);

async function requested(startDate = day(7)) {
  const { mentor, mentorId } = await approvedMentor();
  const student = await registered("STUDENT", "Kamal");
  const res = await api("POST", "/api/programs", {
    token: student.token,
    body: { mentorId, title: "Backend career plan", description: "12 month plan", durationMonths: 12, startDate },
  });
  return { mentor, mentorId, student, res, program: res.body };
}

async function active() {
  const r = await requested();
  await api("POST", `/api/programs/${r.program.id}/accept`, { token: r.mentor.token });
  return r;
}

describe("program request", () => {
  it("is created PENDING by a student and notifies the mentor", async () => {
    const { mentor, mentorId, student, res } = await requested("2026-12-01");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      studentId: student.id,
      studentName: "Kamal User",
      mentorId,
      mentorName: "Mentor User",
      durationMonths: 12,
      startDate: "2026-12-01",
      endDate: "2027-12-01",
      status: "PENDING",
    });
    expect(await titles(mentor)).toContain("New mentorship request");

    const again = await api("POST", "/api/programs", { token: student.token, body: { mentorId, title: "Again", durationMonths: 6, startDate: day(3) } });
    expect(again.status).toBe(409);
  });

  it("validates the body, the mentor and the role", async () => {
    const { mentor, mentorId } = await approvedMentor();
    const student = await registered("STUDENT");
    const base = { mentorId, title: "Plan", durationMonths: 6, startDate: day(1) };
    for (const body of [{ ...base, durationMonths: 3 }, { ...base, title: "" }, { ...base, startDate: day(-1) }, { ...base, startDate: "2026-13-01" }, { ...base, mentorId: "x" }]) {
      expect((await api("POST", "/api/programs", { token: student.token, body })).status).toBe(400);
    }
    expect((await api("POST", "/api/programs", { token: student.token, body: { ...base, mentorId: crypto.randomUUID() } })).status).toBe(404);

    const unapproved = await registered("MENTOR");
    const { body: profile } = await api("PUT", "/api/mentors/me", { token: unapproved.token, body: { title: "E", experienceYears: 1 } });
    expect((await api("POST", "/api/programs", { token: student.token, body: { ...base, mentorId: profile.id } })).status).toBe(404);

    expect((await api("POST", "/api/programs", { token: mentor.token, body: base })).status).toBe(403);
    expect((await api("POST", "/api/programs", { body: base })).status).toBe(401);
  });

  it("is accepted only by its mentor, once", async () => {
    const { mentor, student, program } = await requested();
    const path = `/api/programs/${program.id}/accept`;
    const other = await approvedMentor();
    expect((await api("POST", path, { token: other.mentor.token })).status).toBe(403);
    expect((await api("POST", path, { token: student.token })).status).toBe(403);
    expect((await api("POST", `/api/programs/${crypto.randomUUID()}/accept`, { token: mentor.token })).status).toBe(404);

    const res = await api("POST", path, { token: mentor.token });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ACTIVE");
    expect((await api("POST", path, { token: mentor.token })).status).toBe(409);
    expect((await api("POST", `/api/programs/${program.id}/decline`, { token: mentor.token })).status).toBe(409);
    expect(await titles(student)).toContain("Mentorship request accepted");
  });

  it("can be declined, then the student may ask again", async () => {
    const { mentor, mentorId, student, program } = await requested();
    const res = await api("POST", `/api/programs/${program.id}/decline`, { token: mentor.token });
    expect(res.body.status).toBe("DECLINED");
    expect(await titles(student)).toContain("Mentorship request declined");
    const again = await api("POST", "/api/programs", { token: student.token, body: { mentorId, title: "Again", durationMonths: 6, startDate: day(3) } });
    expect(again.status).toBe(201);
  });

  it("is listed and read by its student and mentor only", async () => {
    const { mentor, student, program } = await requested();
    const mine = await api("GET", "/api/programs?status=PENDING", { token: student.token });
    expect(mine.body).toMatchObject({ totalElements: 1, page: 0, size: 20 });
    expect(mine.body.content[0].id).toBe(program.id);
    expect((await api("GET", "/api/programs", { token: mentor.token })).body.content[0].id).toBe(program.id);
    expect((await api("GET", "/api/programs?status=ACTIVE", { token: mentor.token })).body.totalElements).toBe(0);
    expect((await api("GET", "/api/programs?status=OPEN", { token: mentor.token })).status).toBe(400);

    expect((await api("GET", `/api/programs/${program.id}`, { token: mentor.token })).status).toBe(200);
    expect((await api("GET", `/api/programs/${program.id}`, { token: (await registered("STUDENT")).token })).status).toBe(403);
    expect((await api("GET", `/api/programs/${program.id}`, { token: (await admin()).token })).status).toBe(403);
    expect((await api("GET", `/api/programs/${crypto.randomUUID()}`, { token: student.token })).status).toBe(404);
    expect((await api("GET", "/api/programs")).status).toBe(401);
  });
});

describe("program status", () => {
  it("lets the student cancel a request, not the mentor", async () => {
    const { mentor, student, program } = await requested();
    const path = `/api/programs/${program.id}/status`;
    expect((await api("PUT", path, { token: mentor.token, body: { status: "CANCELLED" } })).status).toBe(409);
    expect((await api("PUT", path, { token: student.token, body: { status: "ACTIVE" } })).status).toBe(400);
    const res = await api("PUT", path, { token: student.token, body: { status: "CANCELLED" } });
    expect(res.body.status).toBe("CANCELLED");
    expect(await titles(mentor)).toContain("Program cancelled");
  });

  it("is completed by the mentor only", async () => {
    const { mentor, student, program } = await active();
    const path = `/api/programs/${program.id}/status`;
    expect((await api("PUT", path, { token: student.token, body: { status: "COMPLETED" } })).status).toBe(403);
    expect((await api("PUT", path, { token: mentor.token, body: { status: "COMPLETED" } })).body.status).toBe("COMPLETED");
    expect((await api("PUT", path, { token: mentor.token, body: { status: "CANCELLED" } })).status).toBe(409);
    expect(await titles(student)).toContain("Program completed");
  });

  it("expires a request that was not accepted before the start date", async () => {
    const { student, program } = await requested(day(1));
    await env.DB.prepare("UPDATE mentorship_programs SET start_date = ? WHERE id = ?").bind(day(-1), program.id).run();
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "* * * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await api("GET", `/api/programs/${program.id}`, { token: student.token })).body.status).toBe("CANCELLED");
    expect(await titles(student)).toContain("Mentorship request expired");
  });

  it("calculates the end date by months", () => {
    expect(addMonths("2026-11-01", 6)).toBe("2027-05-01");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2027-12-15", 48)).toBe("2031-12-15");
  });
});

describe("program goals, tasks, progress and notes", () => {
  it("need an ACTIVE program", async () => {
    const { mentor, program } = await requested();
    expect((await api("POST", `/api/programs/${program.id}/goals`, { token: mentor.token, body: { title: "Goal" } })).status).toBe(409);
    expect((await api("POST", `/api/programs/${program.id}/notes`, { token: mentor.token, body: { content: "Hi" } })).status).toBe(409);
  });

  it("work for the mentor and the student of the program", async () => {
    const { mentor, student, program } = await active();
    const stranger = await registered("STUDENT");

    const goalRes = await api("POST", `/api/programs/${program.id}/goals`, { token: mentor.token, body: { title: "Learn Spring Boot", targetDate: "2027-02-01" } });
    expect(goalRes.status).toBe(201);
    expect(goalRes.body).toMatchObject({ programId: program.id, title: "Learn Spring Boot", status: "NOT_STARTED", progressPercentage: 0, description: null });
    const goal = goalRes.body;
    expect((await api("POST", `/api/programs/${program.id}/goals`, { token: student.token, body: { title: "G" } })).status).toBe(403);
    expect((await api("POST", `/api/programs/${program.id}/goals`, { token: mentor.token, body: { title: "" } })).status).toBe(400);
    expect((await api("GET", `/api/programs/${program.id}/goals`, { token: student.token })).body).toHaveLength(1);
    expect((await api("GET", `/api/programs/${program.id}/goals`, { token: stranger.token })).status).toBe(403);

    const edited = await api("PUT", `/api/program-goals/${goal.id}`, { token: mentor.token, body: { title: "Spring Boot", status: "IN_PROGRESS" } });
    expect(edited.body).toMatchObject({ title: "Spring Boot", status: "IN_PROGRESS", targetDate: null });
    expect((await api("PUT", `/api/program-goals/${crypto.randomUUID()}`, { token: mentor.token, body: { title: "X" } })).status).toBe(404);

    const taskRes = await api("POST", `/api/program-goals/${goal.id}/tasks`, { token: mentor.token, body: { title: "Build a REST API", dueDate: "2026-12-01", priority: "HIGH" } });
    expect(taskRes.status).toBe(201);
    expect(taskRes.body).toMatchObject({ goalId: goal.id, assignedBy: mentor.id, assignedTo: student.id, priority: "HIGH", status: "TODO" });
    const task = taskRes.body;
    await api("POST", `/api/program-goals/${goal.id}/tasks`, { token: mentor.token, body: { title: "Write tests" } });
    expect((await api("POST", `/api/program-goals/${goal.id}/tasks`, { token: mentor.token, body: { title: "T", priority: "URGENT" } })).status).toBe(400);

    const tasks = await api("GET", `/api/programs/${program.id}/tasks`, { token: student.token });
    expect(tasks.body.map((t: { title: string }) => t.title)).toEqual(["Build a REST API", "Write tests"]);
    expect((await api("PUT", `/api/tasks/${task.id}`, { token: mentor.token, body: { title: "Build an API" } })).body).toMatchObject({ title: "Build an API", priority: "HIGH", dueDate: null });
    expect((await api("PUT", `/api/tasks/${task.id}`, { token: student.token, body: { title: "X" } })).status).toBe(403);

    expect((await api("PUT", `/api/tasks/${task.id}/status`, { token: student.token, body: { status: "DONE" } })).body.status).toBe("DONE");
    expect((await api("PUT", `/api/tasks/${task.id}/status`, { token: stranger.token, body: { status: "TODO" } })).status).toBe(403);
    expect((await api("GET", `/api/programs/${program.id}/tasks?status=DONE`, { token: mentor.token })).body).toHaveLength(1);
    expect((await api("GET", `/api/programs/${program.id}/tasks?goalId=${crypto.randomUUID()}`, { token: mentor.token })).body).toEqual([]);

    const progress = await api("POST", `/api/program-goals/${goal.id}/progress`, { token: student.token, body: { percentage: 40, description: "Finished controllers" } });
    expect(progress.status).toBe(201);
    expect(progress.body).toMatchObject({ goalId: goal.id, studentId: student.id, percentage: 40 });
    expect((await api("POST", `/api/program-goals/${goal.id}/progress`, { token: student.token, body: { percentage: 101 } })).status).toBe(400);
    expect((await api("POST", `/api/program-goals/${goal.id}/progress`, { token: mentor.token, body: { percentage: 10 } })).status).toBe(403);
    expect((await api("GET", `/api/program-goals/${goal.id}/progress`, { token: mentor.token })).body).toHaveLength(1);
    expect((await api("GET", `/api/programs/${program.id}/goals`, { token: mentor.token })).body[0].progressPercentage).toBe(40);

    expect((await api("POST", `/api/programs/${program.id}/notes`, { token: mentor.token, body: { content: "Private note" } })).body.visibility).toBe("PRIVATE");
    await api("POST", `/api/programs/${program.id}/notes`, { token: mentor.token, body: { content: "Good progress", visibility: "SHARED" } });
    expect((await api("POST", `/api/programs/${program.id}/notes`, { token: mentor.token, body: { content: "N", sessionId: crypto.randomUUID() } })).status).toBe(400);
    expect((await api("POST", `/api/programs/${program.id}/notes`, { token: student.token, body: { content: "N" } })).status).toBe(403);
    expect((await api("GET", `/api/programs/${program.id}/notes`, { token: mentor.token })).body).toHaveLength(2);
    const shared = await api("GET", `/api/programs/${program.id}/notes`, { token: student.token });
    expect(shared.body.map((n: { content: string }) => n.content)).toEqual(["Good progress"]);

    await api("PUT", `/api/programs/${program.id}/status`, { token: mentor.token, body: { status: "COMPLETED" } });
    expect((await api("POST", `/api/programs/${program.id}/goals`, { token: mentor.token, body: { title: "Late" } })).status).toBe(409);
    expect((await api("PUT", `/api/tasks/${task.id}/status`, { token: student.token, body: { status: "TODO" } })).status).toBe(409);
    expect((await api("GET", `/api/programs/${program.id}/goals`, { token: student.token })).status).toBe(200);
  });
});
