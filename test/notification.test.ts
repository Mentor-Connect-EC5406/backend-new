import { describe, expect, it } from "vitest";
import { api, approvedMentor, registered } from "./helpers";

type Note = { id: string; type: string; channel: string; status: string; readAt: string | null };

describe("notifications", () => {
  it("are created on booking created, confirmed and cancelled", async () => {
    const { mentor, slotId } = await approvedMentor();
    const student = await registered("STUDENT");
    const { body: booking } = await api("POST", "/api/bookings", { token: student.token, body: { slotId } });
    await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token });
    await api("POST", `/api/bookings/${booking.id}/cancel`, { token: student.token });

    const mine = await api("GET", "/api/notifications", { token: student.token });
    const types = mine.body.content.map((n: Note) => n.type).sort();
    expect(types).toEqual(["BOOKING_CANCELLED", "BOOKING_CONFIRMED", "BOOKING_CREATED"]);
    expect(mine.body.content.every((n: Note) => n.channel === "IN_APP" && n.status === "SENT" && n.readAt === null)).toBe(true);
    const mentorTypes = (await api("GET", "/api/notifications", { token: mentor.token })).body.content.map((n: Note) => n.type).sort();
    expect(mentorTypes).toEqual(["BOOKING_CANCELLED", "BOOKING_CONFIRMED"]);
  });

  it("are marked read one by one or all at once, only by their owner", async () => {
    const { slotId } = await approvedMentor();
    const student = await registered("STUDENT");
    const { body: booking } = await api("POST", "/api/bookings", { token: student.token, body: { slotId } });
    await api("POST", `/api/bookings/${booking.id}/confirm`, { token: student.token });
    const [first] = (await api("GET", "/api/notifications", { token: student.token })).body.content as Note[];

    const stranger = await registered("STUDENT");
    expect((await api("PUT", `/api/notifications/${first!.id}/read`, { token: stranger.token })).status).toBe(404);
    const read = await api("PUT", `/api/notifications/${first!.id}/read`, { token: student.token });
    expect(read.body.status).toBe("READ");
    expect((await api("GET", "/api/notifications?status=READ", { token: student.token })).body.totalElements).toBe(1);
    expect((await api("GET", "/api/notifications?status=X", { token: student.token })).status).toBe(400);
    expect((await api("PUT", "/api/notifications/read-all", { token: student.token })).status).toBe(204);
    expect((await api("GET", "/api/notifications?status=SENT", { token: student.token })).body.totalElements).toBe(0);
  });
});

describe("conversations and messages", () => {
  it("starts one chat per pair and keeps messages and unread counts", async () => {
    const a = await registered("STUDENT");
    const b = await registered("MENTOR");
    expect((await api("POST", "/api/conversations", { token: a.token, body: { participantId: a.id } })).status).toBe(400);
    expect((await api("POST", "/api/conversations", { token: a.token, body: { participantId: crypto.randomUUID() } })).status).toBe(404);

    const created = await api("POST", "/api/conversations", { token: a.token, body: { participantId: b.id } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ lastMessage: null, unreadCount: 0 });
    const existing = await api("POST", "/api/conversations", { token: b.token, body: { participantId: a.id } });
    expect(existing.status).toBe(200);
    expect(existing.body.id).toBe(created.body.id);
    const id = created.body.id;

    expect((await api("POST", `/api/conversations/${id}/messages`, { token: a.token, body: { content: " " } })).status).toBe(400);
    expect((await api("POST", `/api/conversations/${id}/messages`, { token: a.token, body: { content: "a".repeat(2001) } })).status).toBe(400);
    expect((await api("POST", `/api/conversations/${id}/messages`, { token: a.token, body: { content: "Hello" } })).status).toBe(201);
    await new Promise((r) => setTimeout(r, 5));
    await api("POST", `/api/conversations/${id}/messages`, { token: b.token, body: { content: "See you tomorrow" } });

    const list = await api("GET", "/api/conversations", { token: a.token });
    expect(list.body[0]).toMatchObject({ id, unreadCount: 1, lastMessage: { content: "See you tomorrow" } });
    const page = await api("GET", `/api/conversations/${id}/messages?size=1`, { token: a.token });
    expect(page.body).toMatchObject({ totalElements: 2, totalPages: 2 });
    expect(page.body.content[0].content).toBe("See you tomorrow");

    expect((await api("PUT", `/api/conversations/${id}/read`, { token: a.token })).status).toBe(204);
    expect((await api("GET", "/api/conversations", { token: a.token })).body[0].unreadCount).toBe(0);
    expect((await api("GET", "/api/conversations", { token: b.token })).body[0].unreadCount).toBe(1);
  });

  it("is closed to outsiders", async () => {
    const a = await registered("STUDENT");
    const b = await registered("MENTOR");
    const outsider = await registered("STUDENT");
    const { body: chat } = await api("POST", "/api/conversations", { token: a.token, body: { participantId: b.id } });
    expect((await api("GET", `/api/conversations/${chat.id}/messages`, { token: outsider.token })).status).toBe(403);
    expect((await api("POST", `/api/conversations/${chat.id}/messages`, { token: outsider.token, body: { content: "hi" } })).status).toBe(403);
    expect((await api("POST", `/api/conversations/${crypto.randomUUID()}/messages`, { token: a.token, body: { content: "hi" } })).status).toBe(404);
    expect((await api("GET", "/api/conversations", { token: outsider.token })).body).toEqual([]);
  });
});
