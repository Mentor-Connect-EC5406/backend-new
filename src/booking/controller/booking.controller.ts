import { Hono } from "hono";
import { authenticate, requireRole } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { parse, parseBody } from "../../util/validate";
import {
  cancelBookingSchema,
  createBookingSchema,
  createReviewSchema,
  listBookingsQuerySchema,
  listReviewsQuerySchema,
} from "../dto/booking.dto";
import * as bookings from "../service/booking.service";
import * as reviews from "../service/review.service";
import * as sessions from "../service/session.service";

export const bookingController = new Hono<AppEnv>();

bookingController.post("/api/bookings", authenticate, requireRole("STUDENT"), async (c) => {
  const body = await parseBody(c.req.raw, createBookingSchema);
  return c.json(await bookings.createBooking(c.env, c.get("user"), body), 201);
});

bookingController.get("/api/bookings", authenticate, requireRole("STUDENT", "MENTOR"), async (c) => {
  const q = parse(listBookingsQuerySchema, c.req.query());
  return c.json(await bookings.listBookings(c.env, c.get("user"), q), 200);
});

bookingController.get("/api/bookings/:id", authenticate, async (c) => {
  return c.json(await bookings.getBooking(c.env, c.get("user"), c.req.param("id")), 200);
});

bookingController.post("/api/bookings/:id/confirm", authenticate, async (c) => {
  return c.json(await bookings.confirmBooking(c.env, c.get("user"), c.req.param("id")), 200);
});

bookingController.post("/api/bookings/:id/cancel", authenticate, async (c) => {
  // the body is optional
  const hasBody = (await c.req.raw.clone().text()).trim() !== "";
  const body = hasBody ? await parseBody(c.req.raw, cancelBookingSchema) : {};
  return c.json(await bookings.cancelBooking(c.env, c.get("user"), c.req.param("id"), body), 200);
});

bookingController.get("/api/bookings/:id/session", authenticate, async (c) => {
  return c.json(await sessions.getSession(c.env, c.get("user"), c.req.param("id")), 200);
});

bookingController.post("/api/bookings/:id/session/start", authenticate, async (c) => {
  return c.json(await sessions.startSession(c.env, c.get("user"), c.req.param("id")), 200);
});

bookingController.post("/api/bookings/:id/session/complete", authenticate, async (c) => {
  return c.json(await sessions.completeSession(c.env, c.get("user"), c.req.param("id")), 200);
});

bookingController.post("/api/bookings/:id/review", authenticate, async (c) => {
  const body = await parseBody(c.req.raw, createReviewSchema);
  return c.json(await reviews.createReview(c.env, c.get("user"), c.req.param("id"), body), 201);
});

bookingController.get("/api/reviews", authenticate, async (c) => {
  const q = parse(listReviewsQuerySchema, c.req.query());
  return c.json(await reviews.listReviews(c.env, q), 200);
});
