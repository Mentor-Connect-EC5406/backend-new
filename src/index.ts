import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, Env } from "./config/env";
import { authController } from "./auth/controller/auth.controller";
import { userController } from "./user/controller/user.controller";
import { mentorController } from "./mentor/controller/mentor.controller";
import { bookingController } from "./booking/controller/booking.controller";
import { notificationController } from "./notification/controller/notification.controller";
import { expirePendingBookings } from "./booking/service/booking-expiry.service";
import { errorHandler, notFoundHandler } from "./exception/error-handler";
import { nowIso } from "./util/time";

const app = new Hono<AppEnv>();

app.use("*", (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })(c, next);
});

app.get("/api/health", (c) => c.json({ status: "UP", time: nowIso() }));

app.route("/api/auth", authController);
app.route("/", userController);
app.route("/", mentorController);
app.route("/", bookingController);
app.route("/", notificationController);

app.onError(errorHandler);
app.notFound(notFoundHandler);

export default {
  fetch: app.fetch,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(expirePendingBookings(env));
  },
} satisfies ExportedHandler<Env>;
