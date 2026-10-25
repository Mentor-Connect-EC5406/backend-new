import { notFound } from "../../exception/api-error";
import { offsetOf, toPage, type Page } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type { CurrentUser } from "../../config/current-user";
import type { Env } from "../../config/env";
import type { ListNotificationsQuery, NewNotification, NotificationResponse } from "../dto/notification.dto";
import type { NotificationRow } from "../entity/notification.entity";
import * as repo from "../repository/notification.repository";

const toResponse = (r: NotificationRow): NotificationResponse => ({
  id: r.id,
  type: r.type,
  title: r.title,
  message: r.message,
  channel: r.channel,
  status: r.status,
  createdAt: r.created_at,
  readAt: r.read_at,
});

// internal helper for other modules (no HTTP); in-app notifications are delivered on insert
export async function createNotification(db: D1Database, n: NewNotification): Promise<string> {
  const now = nowIso();
  const id = newId();
  await repo.insertNotification(db, {
    id,
    user_id: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    channel: "IN_APP",
    status: "SENT",
    retry_count: 0,
    scheduled_at: null,
    sent_at: now,
    read_at: null,
    created_at: now,
  });
  return id;
}

export async function listNotifications(
  env: Env,
  user: CurrentUser,
  q: ListNotificationsQuery,
): Promise<Page<NotificationResponse>> {
  const { rows, total } = await repo.listForUser(env.DB, user.id, q.status ?? null, q.size, offsetOf(q));
  return toPage(rows.map(toResponse), q, total);
}

export async function markRead(env: Env, user: CurrentUser, id: string): Promise<NotificationResponse> {
  if (!(await repo.findForUser(env.DB, id, user.id))) throw notFound("Notification not found");
  await repo.markRead(env.DB, id, nowIso());
  return toResponse((await repo.findForUser(env.DB, id, user.id))!);
}

export async function markAllRead(env: Env, user: CurrentUser): Promise<void> {
  await repo.markAllRead(env.DB, user.id, nowIso());
}
