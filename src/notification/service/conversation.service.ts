import { badRequest, forbidden, notFound } from "../../exception/api-error";
import { offsetOf, toPage, type Page, type PageQuery } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type { CurrentUser } from "../../config/current-user";
import type { Env } from "../../config/env";
import type {
  ConversationResponse,
  MessageResponse,
  SendMessageRequest,
  StartConversationRequest,
} from "../dto/notification.dto";
import type { ConversationListRow, MessageRow } from "../entity/notification.entity";
import * as repo from "../repository/conversation.repository";

const toConversation = (r: ConversationListRow): ConversationResponse => ({
  id: r.id,
  participants: JSON.parse(r.participants) as string[],
  lastMessage: r.last_content !== null && r.last_sent_at !== null ? { content: r.last_content, sentAt: r.last_sent_at } : null,
  unreadCount: r.unread_count,
});

const toMessage = (r: MessageRow): MessageResponse => ({
  id: r.id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  content: r.content,
  attachmentKey: r.attachment_key,
  sentAt: r.sent_at,
  readAt: r.read_at,
});

// 404 when the chat does not exist, 403 when the caller is not in it
async function requireParticipant(db: D1Database, conversationId: string, userId: string) {
  if (!(await repo.conversationExists(db, conversationId))) throw notFound("Conversation not found");
  if (!(await repo.isParticipant(db, conversationId, userId))) throw forbidden("Not a participant of this conversation");
}

export async function startConversation(
  env: Env,
  user: CurrentUser,
  req: StartConversationRequest,
): Promise<{ created: boolean; conversation: ConversationResponse }> {
  if (req.participantId === user.id) {
    throw badRequest("Validation failed", [{ field: "participantId", message: "must not be yourself" }]);
  }
  if (!(await repo.userExists(env.DB, req.participantId))) throw notFound("User not found");

  let id = await repo.findDirect(env.DB, user.id, req.participantId);
  const created = id === null;
  if (id === null) {
    id = newId();
    await repo.insertDirect(env.DB, id, user.id, req.participantId, nowIso());
  }
  return { created, conversation: toConversation((await repo.findForUser(env.DB, id, user.id))!) };
}

export async function listConversations(env: Env, user: CurrentUser): Promise<ConversationResponse[]> {
  return (await repo.listForUser(env.DB, user.id)).map(toConversation);
}

export async function listMessages(
  env: Env,
  user: CurrentUser,
  conversationId: string,
  q: PageQuery,
): Promise<Page<MessageResponse>> {
  await requireParticipant(env.DB, conversationId, user.id);
  const { rows, total } = await repo.listMessages(env.DB, conversationId, q.size, offsetOf(q));
  return toPage(rows.map(toMessage), q, total);
}

export async function sendMessage(
  env: Env,
  user: CurrentUser,
  conversationId: string,
  req: SendMessageRequest,
): Promise<MessageResponse> {
  await requireParticipant(env.DB, conversationId, user.id);
  const row: MessageRow = {
    id: newId(),
    conversation_id: conversationId,
    sender_id: user.id,
    content: req.content,
    attachment_key: req.attachmentKey ?? null,
    sent_at: nowIso(),
    read_at: null,
  };
  await repo.insertMessage(env.DB, row);
  return toMessage(row);
}

export async function markConversationRead(env: Env, user: CurrentUser, conversationId: string): Promise<void> {
  await requireParticipant(env.DB, conversationId, user.id);
  await repo.markReadFromOthers(env.DB, conversationId, user.id, nowIso());
}

// R2 uploads are out of Sprint 2 scope
export async function attachmentUploadUrl(env: Env, user: CurrentUser, conversationId: string) {
  await requireParticipant(env.DB, conversationId, user.id);
  return { uploadUrl: null, key: null };
}
