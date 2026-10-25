import { conflict } from "../../exception/api-error";
import { offsetOf, toPage, type Page } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type { CurrentUser } from "../../config/current-user";
import type { Env } from "../../config/env";
import {
  toReviewResponse,
  type CreateReviewRequest,
  type ListReviewsQuery,
  type ReviewResponse,
} from "../dto/booking.dto";
import type { ReviewRow } from "../entity/booking.entity";
import * as repo from "../repository/review.repository";
import { loadForParty } from "./booking.service";

export async function createReview(
  env: Env,
  user: CurrentUser,
  bookingId: string,
  req: CreateReviewRequest,
): Promise<ReviewResponse> {
  const booking = await loadForParty(env.DB, bookingId, user, ["STUDENT"]);
  if (booking.status !== "COMPLETED") throw conflict("Booking is not COMPLETED");
  if (await repo.existsForBooking(env.DB, bookingId)) throw conflict("Booking is already reviewed");

  const row: ReviewRow = {
    id: newId(),
    booking_id: booking.id,
    student_id: booking.student_id,
    mentor_id: booking.mentor_id,
    rating: req.rating,
    comment: req.comment || null,
    created_at: nowIso(),
  };
  try {
    await repo.insertAndRate(env.DB, row);
  } catch (e) {
    // the unique booking_id and trigger trg_reviews_require_completed guard against races
    if (String(e).includes("UNIQUE")) throw conflict("Booking is already reviewed");
    if (String(e).includes("COMPLETED")) throw conflict("Booking is not COMPLETED");
    throw e;
  }
  return toReviewResponse(row);
}

export async function listReviews(env: Env, q: ListReviewsQuery): Promise<Page<ReviewResponse>> {
  const { rows, total } = await repo.listByMentor(env.DB, q.mentorId, q.size, offsetOf(q));
  return toPage(rows.map(toReviewResponse), q, total);
}
