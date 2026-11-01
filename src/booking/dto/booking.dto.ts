import { z } from "zod";
import { pageQuerySchema } from "../../util/pagination";
import type { BookingDetailRow, ReviewRow, SessionRow } from "../entity/booking.entity";

export const createBookingSchema = z.object({
  slotId: z.string().uuid("must be a valid UUID"),
  topic: z.string().trim().max(200).optional(),
});

export const listBookingsQuerySchema = pageQuerySchema.extend({
  status: z
    .enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "RESCHEDULED", "NO_SHOW"], { error: "must be a booking status" })
    .optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const rescheduleBookingSchema = z.object({
  slotId: z.string().uuid("must be a valid UUID"),
});

export const createReviewSchema = z.object({
  rating: z.number({ error: "must be a number from 1 to 5" }).int("must be a whole number").min(1).max(5),
  comment: z.string({ error: "is required" }).trim().min(20, "must be at least 20 characters").max(1000),
});

export const listReviewsQuerySchema = pageQuerySchema.extend({
  mentorId: z.string({ error: "is required" }).uuid("must be a valid UUID"),
});

export type CreateBookingRequest = z.infer<typeof createBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
export type CancelBookingRequest = z.infer<typeof cancelBookingSchema>;
export type RescheduleBookingRequest = z.infer<typeof rescheduleBookingSchema>;
export type CreateReviewRequest = z.infer<typeof createReviewSchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;

export type BookingResponse = {
  id: string;
  studentId: string;
  studentName: string | null;
  mentorId: string;
  mentorName: string | null;
  slotId: string;
  meetingUrl: string | null;
  reviewed: boolean;
  scheduledStart: string;
  scheduledEnd: string;
  topic: string | null;
  priceCents: number;
  currency: string;
  status: string;
  cancellationReason: string | null;
  rescheduledFromId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SessionResponse = {
  id: string;
  bookingId: string;
  meetingUrl: string | null;
  meetingProvider: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  status: string;
};

export type ReviewResponse = {
  id: string;
  bookingId: string;
  studentId: string;
  mentorId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export const toBookingResponse = (r: BookingDetailRow): BookingResponse => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.student_name,
  mentorId: r.mentor_id,
  mentorName: r.mentor_name,
  slotId: r.slot_id,
  meetingUrl: r.meeting_url,
  reviewed: r.reviewed === 1,
  scheduledStart: r.scheduled_start,
  scheduledEnd: r.scheduled_end,
  topic: r.topic,
  priceCents: r.price_cents,
  currency: r.currency,
  status: r.status,
  cancellationReason: r.cancellation_reason,
  rescheduledFromId: r.rescheduled_from_id,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toSessionResponse = (r: SessionRow): SessionResponse => ({
  id: r.id,
  bookingId: r.booking_id,
  meetingUrl: r.meeting_url,
  meetingProvider: r.meeting_provider,
  actualStart: r.actual_start,
  actualEnd: r.actual_end,
  status: r.status,
});

export const toReviewResponse = (r: ReviewRow): ReviewResponse => ({
  id: r.id,
  bookingId: r.booking_id,
  studentId: r.student_id,
  mentorId: r.mentor_id,
  rating: r.rating,
  comment: r.comment,
  createdAt: r.created_at,
});
