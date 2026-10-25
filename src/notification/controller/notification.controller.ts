import { Hono } from "hono";
import { authenticate } from "../../config/auth.middleware";
import type { AppEnv } from "../../config/env";
import { pageQuerySchema } from "../../util/pagination";
import { parse, parseBody } from "../../util/validate";
import { listNotificationsQuerySchema, sendMessageSchema, startConversationSchema } from "../dto/notification.dto";
import * as conversations from "../service/conversation.service";
import * as notifications from "../service/notification.service";

export const notificationController = new Hono<AppEnv>();

notificationController.get("/api/notifications", authenticate, async (c) => {
  const q = parse(listNotificationsQuerySchema, c.req.query());
  return c.json(await notifications.listNotifications(c.env, c.get("user"), q), 200);
});

notificationController.put("/api/notifications/read-all", authenticate, async (c) => {
  await notifications.markAllRead(c.env, c.get("user"));
  return c.body(null, 204);
});

notificationController.put("/api/notifications/:id/read", authenticate, async (c) => {
  return c.json(await notifications.markRead(c.env, c.get("user"), c.req.param("id")), 200);
});

notificationController.post("/api/conversations", authenticate, async (c) => {
  const body = await parseBody(c.req.raw, startConversationSchema);
  const { created, conversation } = await conversations.startConversation(c.env, c.get("user"), body);
  return c.json(conversation, created ? 201 : 200);
});

notificationController.get("/api/conversations", authenticate, async (c) => {
  return c.json(await conversations.listConversations(c.env, c.get("user")), 200);
});

notificationController.get("/api/conversations/:id/messages", authenticate, async (c) => {
  const q = parse(pageQuerySchema, c.req.query());
  return c.json(await conversations.listMessages(c.env, c.get("user"), c.req.param("id"), q), 200);
});

notificationController.post("/api/conversations/:id/messages", authenticate, async (c) => {
  const body = await parseBody(c.req.raw, sendMessageSchema);
  return c.json(await conversations.sendMessage(c.env, c.get("user"), c.req.param("id"), body), 201);
});

notificationController.put("/api/conversations/:id/read", authenticate, async (c) => {
  await conversations.markConversationRead(c.env, c.get("user"), c.req.param("id"));
  return c.body(null, 204);
});

notificationController.post("/api/conversations/:id/attachment-upload-url", authenticate, async (c) => {
  return c.json(await conversations.attachmentUploadUrl(c.env, c.get("user"), c.req.param("id")), 200);
});
