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
} from "../dto/booking.dto";
import type { BookingRow } from "../entity/booking.entity";
import * as repo from "../repository/booking.repository";

const HOLD_MINUTES = 15;

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
    expires_at: new Date(Date.parse(now) + HOLD_MINUTES * 60000).toISOString(),
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
    message: `Your session on ${formatUtc(row.scheduled_start)} is held for ${HOLD_MINUTES} minutes. Confirm it to keep it`,
  });
  return toBookingResponse(row);
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
  return toBookingResponse(await loadForParty(env.DB, id, user, ["STUDENT", "MENTOR", "ADMIN"]));
}

export async function confirmBooking(env: Env, user: CurrentUser, id: string): Promise<BookingResponse> {
  const booking = await loadForParty(env.DB, id, user, ["STUDENT"]);
  if (booking.status === "CONFIRMED") return toBookingResponse(booking);
  if (booking.status !== "PENDING") throw conflict("Booking is not PENDING");

  const now = nowIso();
  if (booking.expires_at && booking.expires_at <= now) throw conflict("Booking has expired");
  const meetingUrl = `https://meet.jit.si/mentorconnect-${booking.id.slice(0, 8)}`;
  const changed = await repo.confirm(env.DB, booking, newId(), meetingUrl, now);

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
  return toBookingResponse(updated);
}

export async function cancelBooking(
  env: Env,
  user: CurrentUser,
  id: string,
  req: CancelBookingRequest,
): Promise<BookingResponse> {
  const booking = await loadForParty(env.DB, id, user, ["STUDENT", "MENTOR"]);
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") throw conflict("Booking is not cancellable");

  if (!(await repo.cancel(env.DB, booking, req.reason || null, nowIso()))) throw conflict("Booking is not cancellable");
  const updated = (await repo.findById(env.DB, id))!;

  const message = `The session on ${formatUtc(updated.scheduled_start)} was cancelled`;
  await createNotification(env.DB, { userId: updated.student_id, type: "BOOKING_CANCELLED", title: "Booking cancelled", message });
  const mentorUser = await mentorUserId(env.DB, updated.mentor_id);
  if (mentorUser) {
    await createNotification(env.DB, { userId: mentorUser, type: "BOOKING_CANCELLED", title: "Booking cancelled", message });
  }
  return toBookingResponse(updated);
}
