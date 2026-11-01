import { ApiError, conflict, forbidden, notFound } from "../../exception/api-error";
import { createNotification } from "../../notification/service/notification.service";
import { offsetOf, toPage, type Page } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type { CurrentUser } from "../../config/current-user";
import type { Env } from "../../config/env";
import {
  toBookingResponse,
  type BookingResponse,
  type CancelBookingRequest,
  type CreateBookingRequest,
  type ListBookingsQuery,
  type RescheduleBookingRequest,
} from "../dto/booking.dto";
import type { BookingRow } from "../entity/booking.entity";
import * as repo from "../repository/booking.repository";

const RESPONSE_HOURS = 24;
const CHANGE_LIMIT_HOURS = 12;

// the mentor answers within 24 hours, and never later than the slot start
const responseDeadline = (now: string, slotStart: string) =>
  new Date(Math.min(Date.parse(now) + RESPONSE_HOURS * 3600000, Date.parse(slotStart))).toISOString();

const meetingUrlFor = (bookingId: string) => `https://meet.jit.si/mentorconnect-${bookingId.slice(0, 8)}`;

// cancel and reschedule close 12 hours before the start
function requireChangeWindow(b: BookingRow, action: string) {
  if (Date.parse(b.scheduled_start) - Date.now() < CHANGE_LIMIT_HOURS * 3600000) {
    throw conflict(`A booking cannot be ${action} within ${CHANGE_LIMIT_HOURS} hours of its start`);
  }
}

// "2026-11-05 09:00 UTC"
export const formatUtc = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export type Party = "STUDENT" | "MENTOR" | "ADMIN" | null;

// how the caller relates to the booking
export async function partyOf(db: D1Database, b: BookingRow, user: CurrentUser): Promise<Party> {
  if (user.role === "STUDENT") return b.student_id === user.id ? "STUDENT" : null;
  if (user.role === "MENTOR") return (await repo.findMentorIdByUser(db, user.id)) === b.mentor_id ? "MENTOR" : null;
  return "ADMIN";
}

// 404 when missing, 403 when the caller's party is not allowed
export async function loadForParty(db: D1Database, id: string, user: CurrentUser, allowed: Party[]) {
  const booking = await repo.findById(db, id);
  if (!booking) throw notFound("Booking not found");
  const party = await partyOf(db, booking, user);
  if (!allowed.includes(party)) throw forbidden("Not allowed for this booking");
  return booking;
}

const detailOf = async (db: D1Database, id: string) => toBookingResponse((await repo.findDetail(db, id))!);

async function mentorUserId(db: D1Database, mentorId: string) {
  return (await repo.findMentor(db, mentorId))?.user_id ?? null;
}

export async function createBooking(env: Env, user: CurrentUser, req: CreateBookingRequest): Promise<BookingResponse> {
  const slot = await repo.findSlot(env.DB, req.slotId);
  if (!slot) throw notFound("Slot not found");
  const mentor = await repo.findMentor(env.DB, slot.mentor_id);
  if (!mentor || mentor.verification_status !== "APPROVED") throw conflict("Mentor is not approved");
  if (slot.status !== "AVAILABLE" || Date.parse(slot.start_time) <= Date.now()) {
    throw conflict("Slot is not available");
  }

  const now = nowIso();
  const minutes = (Date.parse(slot.end_time) - Date.parse(slot.start_time)) / 60000;
  const row: BookingRow = {
    id: newId(),
    student_id: user.id,
    mentor_id: mentor.id,
    slot_id: slot.id,
    scheduled_start: slot.start_time,
    scheduled_end: slot.end_time,
    topic: req.topic || null,
    price_cents: Math.round((mentor.hourly_rate_cents * minutes) / 60),
    currency: mentor.currency,
    status: "PENDING",
    cancellation_reason: null,
    rescheduled_from_id: null,
    expires_at: responseDeadline(now, slot.start_time),
    created_at: now,
    updated_at: now,
  };

  try {
    if (!(await repo.insertWithHold(env.DB, row, slot.version))) throw conflict("Slot is not available");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (String(e).includes("UNIQUE")) throw conflict("Slot is already booked");
    throw e;
  }

  await createNotification(env.DB, {
    userId: user.id,
    type: "BOOKING_CREATED",
    title: "Booking created",
    message: `Your request for the session on ${formatUtc(row.scheduled_start)} was sent to the mentor`,
  });
  await createNotification(env.DB, {
    userId: mentor.user_id,
    type: "BOOKING_CREATED",
    title: "New booking request",
    message: `A student asked for the session on ${formatUtc(row.scheduled_start)}. Accept or decline it`,
  });
  return detailOf(env.DB, row.id);
}

export async function listBookings(env: Env, user: CurrentUser, q: ListBookingsQuery): Promise<Page<BookingResponse>> {
  let column: "student_id" | "mentor_id" = "student_id";
  let ownerId: string | null = user.id;
  if (user.role === "MENTOR") {
    column = "mentor_id";
    ownerId = await repo.findMentorIdByUser(env.DB, user.id);
  }
  if (!ownerId) return toPage([], q, 0);
  const { rows, total } = await repo.listBy(env.DB, column, ownerId, q.status ?? null, q.size, offsetOf(q));
  return toPage(rows.map(toBookingResponse), q, total);
}

export async function getBooking(env: Env, user: CurrentUser, id: string): Promise<BookingResponse> {
  await loadForParty(env.DB, id, user, ["STUDENT", "MENTOR", "ADMIN"]);
  return detailOf(env.DB, id);
}

export async function acceptBooking(env: Env, user: CurrentUser, id: string): Promise<BookingResponse> {
  const booking = await loadForParty(env.DB, id, user, ["MENTOR"]);
  if (booking.status === "CONFIRMED") return detailOf(env.DB, id);
  if (booking.status !== "PENDING") throw conflict("Booking is not PENDING");

  const now = nowIso();
  if (booking.expires_at && booking.expires_at <= now) throw conflict("Booking has expired");
  const changed = await repo.confirm(env.DB, booking, newId(), meetingUrlFor(booking.id), now);

  const updated = (await repo.findById(env.DB, id))!;
  if (updated.status !== "CONFIRMED") throw conflict("Booking was cancelled or expired");
  if (changed) {
    const message = `Your session on ${formatUtc(updated.scheduled_start)} is confirmed`;
    await createNotification(env.DB, { userId: updated.student_id, type: "BOOKING_CONFIRMED", title: "Booking confirmed", message });
    const mentorUser = await mentorUserId(env.DB, updated.mentor_id);
    if (mentorUser) {
      await createNotification(env.DB, { userId: mentorUser, type: "BOOKING_CONFIRMED", title: "New session booked", message });
    }
  }
  return detailOf(env.DB, id);
}

export async function declineBooking(
  env: Env,
  user: CurrentUser,
  id: string,
  req: CancelBookingRequest,
): Promise<BookingResponse> {
  const booking = await loadForParty(env.DB, id, user, ["MENTOR"]);
  if (booking.status !== "PENDING") throw conflict("Booking is not PENDING");

  if (!(await repo.cancel(env.DB, booking, req.reason || "Declined by the mentor", nowIso()))) {
    throw conflict("Booking is not PENDING");
  }
  await createNotification(env.DB, {
    userId: booking.student_id,
    type: "BOOKING_CANCELLED",
    title: "Booking declined",
    message: `The mentor declined the session on ${formatUtc(booking.scheduled_start)}`,
  });
  return detailOf(env.DB, id);
}

// the old booking becomes RESCHEDULED and a new one keeps its status on the new slot
export async function rescheduleBooking(
  env: Env,
  user: CurrentUser,
  id: string,
  req: RescheduleBookingRequest,
): Promise<BookingResponse> {
  const booking = await loadForParty(env.DB, id, user, ["STUDENT"]);
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") throw conflict("Booking cannot be rescheduled");
  requireChangeWindow(booking, "rescheduled");

  const slot = await repo.findSlot(env.DB, req.slotId);
  if (!slot) throw notFound("Slot not found");
  if (slot.mentor_id !== booking.mentor_id) throw conflict("The new slot must belong to the same mentor");
  if (slot.status !== "AVAILABLE" || Date.parse(slot.start_time) <= Date.now()) throw conflict("Slot is not available");
  const length = (start: string, end: string) => Date.parse(end) - Date.parse(start);
  if (length(slot.start_time, slot.end_time) !== length(booking.scheduled_start, booking.scheduled_end)) {
    throw conflict("The new slot must have the same length");
  }

  const now = nowIso();
  const confirmed = booking.status === "CONFIRMED";
  const row: BookingRow = {
    ...booking,
    id: newId(),
    slot_id: slot.id,
    scheduled_start: slot.start_time,
    scheduled_end: slot.end_time,
    rescheduled_from_id: booking.id,
    expires_at: confirmed ? null : responseDeadline(now, slot.start_time),
    created_at: now,
    updated_at: now,
  };

  try {
    const session = confirmed ? { id: newId(), meetingUrl: meetingUrlFor(row.id) } : null;
    if (!(await repo.reschedule(env.DB, booking, row, slot.version, session))) throw conflict("Slot is not available");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (String(e).includes("UNIQUE")) throw conflict("Slot is already booked");
    throw e;
  }

  const message = `The session on ${formatUtc(booking.scheduled_start)} moved to ${formatUtc(row.scheduled_start)}`;
  await createNotification(env.DB, { userId: row.student_id, type: "BOOKING_RESCHEDULED", title: "Booking rescheduled", message });
  const mentorUser = await mentorUserId(env.DB, row.mentor_id);
  if (mentorUser) {
    await createNotification(env.DB, { userId: mentorUser, type: "BOOKING_RESCHEDULED", title: "Booking rescheduled", message });
  }
  return detailOf(env.DB, row.id);
}

export async function cancelBooking(
  env: Env,
  user: CurrentUser,
  id: string,
  req: CancelBookingRequest,
): Promise<BookingResponse> {
  const booking = await loadForParty(env.DB, id, user, ["STUDENT", "MENTOR"]);
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") throw conflict("Booking is not cancellable");
  requireChangeWindow(booking, "cancelled");

  if (!(await repo.cancel(env.DB, booking, req.reason || null, nowIso()))) throw conflict("Booking is not cancellable");
  const updated = (await repo.findById(env.DB, id))!;

  const message = `The session on ${formatUtc(updated.scheduled_start)} was cancelled`;
  await createNotification(env.DB, { userId: updated.student_id, type: "BOOKING_CANCELLED", title: "Booking cancelled", message });
  const mentorUser = await mentorUserId(env.DB, updated.mentor_id);
  if (mentorUser) {
    await createNotification(env.DB, { userId: mentorUser, type: "BOOKING_CANCELLED", title: "Booking cancelled", message });
  }
  return detailOf(env.DB, id);
}
