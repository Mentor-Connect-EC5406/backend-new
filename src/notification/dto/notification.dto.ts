import { z } from "zod";
import { pageQuerySchema } from "../../util/pagination";

export const listNotificationsQuerySchema = pageQuerySchema.extend({
  status: z.enum(["PENDING", "SENT", "FAILED", "READ"], { error: "must be PENDING, SENT, FAILED or READ" }).optional(),
});

export const startConversationSchema = z.object({
  participantId: z.string().uuid("must be a valid UUID"),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "must not be blank").max(2000),
  attachmentKey: z.string().max(500).nullable().optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type StartConversationRequest = z.infer<typeof startConversationSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

// used by other modules through createNotification
export type NewNotification = {
  userId: string;
  type: string;
  title: string;
  message: string;
};

export type NotificationResponse = {
  id: string;
  type: string;
  title: string;
  message: string;
  channel: string;
  status: string;
  createdAt: string;
  readAt: string | null;
};

export type ConversationResponse = {
  id: string;
  participants: string[];
  lastMessage: { content: string; sentAt: string } | null;
  unreadCount: number;
};

export type MessageResponse = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  attachmentKey: string | null;
  sentAt: string;
  readAt: string | null;
};
