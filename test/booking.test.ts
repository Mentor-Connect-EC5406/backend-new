import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { api, approvedMentor, HOUR, registered, slot } from "./helpers";

const slotStatus = async (id: string) =>
  (await env.DB.prepare("SELECT status FROM availability_slots WHERE id = ?").bind(id).first<{ status: string }>())!.status;

async function book() {
  const setup = await approvedMentor(6000);
  const student = await registered("STUDENT");
  const res = await api("POST", "/api/bookings", { token: student.token, body: { slotId: setup.slotId, topic: "Career guidance" } });
  expect(res.status).toBe(201);
  return { ...setup, student, booking: res.body };
}

describe("create booking", () => {
  it("holds the slot, prices by length and expires in 15 minutes", async () => {
    const { booking, slotId } = await book();
    expect(booking).toMatchObject({ status: "PENDING", priceCents: 6000, currency: "USD", topic: "Career guidance" });
    expect(Date.parse(booking.expiresAt) - Date.parse(booking.createdAt)).toBe(15 * 60_000);
    expect(await slotStatus(slotId)).toBe("HELD");
  });

  it("prices a 30 minute slot at half the hourly rate", async () => {
    const { mentor } = await approvedMentor(5000);
    const student = await registered("STUDENT");
    const slotId = await slot(mentor, 72 * HOUR, 30);
    expect((await api("POST", "/api/bookings", { token: student.token, body: { slotId } })).body.priceCents).toBe(2500);
  });

  it("prevents double booking and checks role, body and slot", async () => {
    const { slotId, mentor } = await book();
    const other = await registered("STUDENT");
    expect((await api("POST", "/api/bookings", { token: other.token, body: { slotId } })).status).toBe(409);
    expect((await api("POST", "/api/bookings", { token: mentor.token, body: { slotId } })).status).toBe(403);
    expect((await api("POST", "/api/bookings", { token: other.token, body: { slotId: "x", topic: "a".repeat(201) } })).status).toBe(400);
    expect((await api("POST", "/api/bookings", { token: other.token, body: { slotId: crypto.randomUUID() } })).status).toBe(404);
    expect((await api("POST", "/api/bookings", { body: { slotId } })).status).toBe(401);
  });

  it("refuses a slot that already started or is blocked", async () => {
    const { mentor, slotId } = await approvedMentor();
    const student = await registered("STUDENT");
    await env.DB.prepare("UPDATE availability_slots SET start_time = ?, end_time = ? WHERE id = ?")
      .bind(new Date(Date.now() - 2 * HOUR).toISOString(), new Date(Date.now() - HOUR).toISOString(), slotId)
      .run();
    expect((await api("POST", "/api/bookings", { token: student.token, body: { slotId } })).status).toBe(409);
    const blocked = await slot(mentor, 100 * HOUR);
    await env.DB.prepare("UPDATE availability_slots SET status = 'BLOCKED' WHERE id = ?").bind(blocked).run();
    expect((await api("POST", "/api/bookings", { token: student.token, body: { slotId: blocked } })).status).toBe(409);
  });
});

describe("list and read", () => {
  it("shows own bookings to the student and the mentor, and hides them from others", async () => {
    const { booking, student, mentor, admin } = await book();
    const mine = await api("GET", "/api/bookings", { token: student.token });
    expect(mine.body).toMatchObject({ totalElements: 1, page: 0, size: 20, totalPages: 1 });
    expect((await api("GET", "/api/bookings?status=PENDING&size=1", { token: mentor.token })).body.totalElements).toBe(1);
    expect((await api("GET", "/api/bookings?status=NOPE", { token: student.token })).status).toBe(400);

    expect((await api("GET", `/api/bookings/${booking.id}`, { token: mentor.token })).status).toBe(200);
    expect((await api("GET", `/api/bookings/${booking.id}`, { token: admin.token })).status).toBe(200);
    const stranger = await registered("STUDENT");
    expect((await api("GET", `/api/bookings/${booking.id}`, { token: stranger.token })).status).toBe(403);
    expect((await api("GET", `/api/bookings/${crypto.randomUUID()}`, { token: student.token })).status).toBe(404);
  });
});

describe("confirm and cancel", () => {
  it("confirms once (safe to repeat), books the slot and creates the session", async () => {
    const { booking, student, mentor, slotId } = await book();
    expect((await api("GET", `/api/bookings/${booking.id}/session`, { token: student.token })).status).toBe(404);
    expect((await api("POST", `/api/bookings/${booking.id}/confirm`, { token: mentor.token })).status).toBe(403);

    const ok = await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token });
    expect(ok.body).toMatchObject({ status: "CONFIRMED", expiresAt: null });
    expect((await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token })).status).toBe(200);
    expect(await slotStatus(slotId)).toBe("BOOKED");

    const session = await api("GET", `/api/bookings/${booking.id}/session`, { token: mentor.token });
    expect(session.body).toMatchObject({ status: "SCHEDULED", meetingProvider: "JITSI" });
    expect(session.body.meetingUrl).toContain(booking.id.slice(0, 8));
  });

  it("cancels, frees the slot, cancels the session and lets the slot be booked again", async () => {
    const { booking, student, mentor, slotId, admin } = await book();
    await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token });
    expect((await api("POST", `/api/bookings/${booking.id}/cancel`, { token: admin.token })).status).toBe(403);
    expect((await api("POST", `/api/bookings/${booking.id}/cancel`, { token: student.token, body: { reason: "a".repeat(501) } })).status).toBe(400);

    const cancelled = await api("POST", `/api/bookings/${booking.id}/cancel`, { token: mentor.token });
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(await slotStatus(slotId)).toBe("AVAILABLE");
    expect((await api("GET", `/api/bookings/${booking.id}/session`, { token: student.token })).body.status).toBe("CANCELLED");
    expect((await api("POST", `/api/bookings/${booking.id}/cancel`, { token: student.token })).status).toBe(409);
    expect((await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token })).status).toBe(409);

    const again = await registered("STUDENT");
    expect((await api("POST", "/api/bookings", { token: again.token, body: { slotId } })).status).toBe(201);
  });
});

describe("session and review", () => {
  it("runs the session in its window and updates the mentor rating after the review", async () => {
    const { mentor, mentorId } = await approvedMentor();
    const student = await registered("STUDENT");
    const early = await slot(mentor, 5 * 60_000);
    const { body: booking } = await api("POST", "/api/bookings", { token: student.token, body: { slotId: early } });

    expect((await api("POST", `/api/bookings/${booking.id}/session/start`, { token: mentor.token })).status).toBe(409);
    expect((await api("POST", `/api/bookings/${booking.id}/review`, { token: student.token, body: { rating: 5 } })).status).toBe(409);
    await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token });
    expect((await api("POST", `/api/bookings/${booking.id}/session/complete`, { token: mentor.token })).status).toBe(409);
    expect((await api("POST", `/api/bookings/${booking.id}/session/start`, { token: student.token })).status).toBe(403);

    const started = await api("POST", `/api/bookings/${booking.id}/session/start`, { token: mentor.token });
    expect(started.body.status).toBe("IN_PROGRESS");
    expect((await api("POST", `/api/bookings/${booking.id}/session/start`, { token: mentor.token })).status).toBe(409);
    const done = await api("POST", `/api/bookings/${booking.id}/session/complete`, { token: mentor.token });
    expect(done.body.status).toBe("COMPLETED");
    expect((await api("GET", `/api/bookings/${booking.id}`, { token: student.token })).body.status).toBe("COMPLETED");

    expect((await api("POST", `/api/bookings/${booking.id}/review`, { token: student.token, body: { rating: 6 } })).status).toBe(400);
    expect((await api("POST", `/api/bookings/${booking.id}/review`, { token: mentor.token, body: { rating: 5 } })).status).toBe(403);
    const review = await api("POST", `/api/bookings/${booking.id}/review`, { token: student.token, body: { rating: 4, comment: "Helpful" } });
    expect(review.status).toBe(201);
    expect((await api("POST", `/api/bookings/${booking.id}/review`, { token: student.token, body: { rating: 5 } })).status).toBe(409);

    const view = await api("GET", `/api/mentors/${mentorId}`, { token: student.token });
    expect(view.body).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
    const list = await api("GET", `/api/reviews?mentorId=${mentorId}`, { token: student.token });
    expect(list.body.content[0].id).toBe(review.body.id);
    expect((await api("GET", "/api/reviews", { token: student.token })).status).toBe(400);
  });

  it("refuses to start a session that is too early", async () => {
    const { booking, student, mentor } = await book();
    await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token });
    const res = await api("POST", `/api/bookings/${booking.id}/session/start`, { token: mentor.token });
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("early");
  });
});

describe("expiry cron", () => {
  it("cancels an expired PENDING booking, frees the slot and notifies the student", async () => {
    const { booking, student, slotId } = await book();
    await env.DB.prepare("UPDATE bookings SET expires_at = ? WHERE id = ?").bind(new Date(Date.now() - 60_000).toISOString(), booking.id).run();
    expect((await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token })).status).toBe(409);

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: "* * * * *" }), env, ctx);
    await waitOnExecutionContext(ctx);

    const after = await api("GET", `/api/bookings/${booking.id}`, { token: student.token });
    expect(after.body).toMatchObject({ status: "CANCELLED", cancellationReason: "Booking expired" });
    expect(await slotStatus(slotId)).toBe("AVAILABLE");
    const notes = await api("GET", "/api/notifications", { token: student.token });
    expect(notes.body.content.some((n: { title: string }) => n.title === "Booking expired")).toBe(true);
  });
});
