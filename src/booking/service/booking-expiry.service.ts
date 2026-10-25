import type { Env } from "../../config/env";
import { createNotification } from "../../notification/service/notification.service";
import { nowIso } from "../../util/time";
import * as repo from "../repository/booking.repository";
import { formatUtc } from "./booking.service";

const BATCH_LIMIT = 100;

// cron: cancel PENDING bookings past expires_at and free their slots
export async function expirePendingBookings(env: Env): Promise<void> {
  const now = nowIso();
  for (const booking of await repo.findExpired(env.DB, now, BATCH_LIMIT)) {
    if (!(await repo.expire(env.DB, booking, now))) continue;
    await createNotification(env.DB, {
      userId: booking.student_id,
      type: "BOOKING_CANCELLED",
      title: "Booking expired",
      message: `Your session on ${formatUtc(booking.scheduled_start)} was not confirmed in time and was cancelled`,
    });
  }
}
