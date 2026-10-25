export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  channel: "EMAIL" | "PUSH" | "IN_APP";
  status: "PENDING" | "SENT" | "FAILED" | "READ";
  retry_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachment_key: string | null;
  sent_at: string;
  read_at: string | null;
};

// one row of the conversation list query
export type ConversationListRow = {
  id: string;
  participants: string;
  last_content: string | null;
  last_sent_at: string | null;
  unread_count: number;
};
