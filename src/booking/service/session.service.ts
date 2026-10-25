import { conflict, notFound } from "../../exception/api-error";
import type { CurrentUser } from "../../config/current-user";
import type { Env } from "../../config/env";
import { toSessionResponse, type SessionResponse } from "../dto/booking.dto";
import * as repo from "../repository/session.repository";
import { loadForParty } from "./booking.service";

const EARLY_START_MINUTES = 15;

async function loadSession(db: D1Database, bookingId: string) {
  const session = await repo.findByBooking(db, bookingId);
  if (!session) throw notFound("Session not found, the booking is not confirmed yet");
  return session;
}

export async function getSession(env: Env, user: CurrentUser, bookingId: string): Promise<SessionResponse> {
  await loadForParty(env.DB, bookingId, user, ["STUDENT", "MENTOR"]);
  return toSessionResponse(await loadSession(env.DB, bookingId));
}

export async function startSession(env: Env, user: CurrentUser, bookingId: string): Promise<SessionResponse> {
  const booking = await loadForParty(env.DB, bookingId, user, ["MENTOR"]);
  if (booking.status !== "CONFIRMED") throw conflict("Booking is not CONFIRMED");
  const session = await loadSession(env.DB, bookingId);
  if (session.status !== "SCHEDULED") throw conflict("Session already started");

  const now = Date.now();
  if (now < Date.parse(booking.scheduled_start) - EARLY_START_MINUTES * 60000) throw conflict("Too early to start the session");
  if (now > Date.parse(booking.scheduled_end)) throw conflict("Too late to start the session");

  const result = await repo.start(env.DB, session.id, new Date(now).toISOString());
  if (result.meta.changes !== 1) throw conflict("Session already started");
  return toSessionResponse((await repo.findByBooking(env.DB, bookingId))!);
}

export async function completeSession(env: Env, user: CurrentUser, bookingId: string): Promise<SessionResponse> {
  await loadForParty(env.DB, bookingId, user, ["MENTOR"]);
  const session = await loadSession(env.DB, bookingId);
  if (session.status !== "IN_PROGRESS") throw conflict("Session is not IN_PROGRESS");

  if (!(await repo.complete(env.DB, session.id, bookingId, new Date().toISOString()))) {
    throw conflict("Session is not IN_PROGRESS");
  }
  return toSessionResponse((await repo.findByBooking(env.DB, bookingId))!);
}
