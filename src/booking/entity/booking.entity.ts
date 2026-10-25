export type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED" | "NO_SHOW";

export type BookingRow = {
  id: string;
  student_id: string;
  mentor_id: string;
  slot_id: string;
  scheduled_start: string;
  scheduled_end: string;
  topic: string | null;
  price_cents: number;
  currency: string;
  status: BookingStatus;
  cancellation_reason: string | null;
  rescheduled_from_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  booking_id: string;
  meeting_url: string | null;
  meeting_provider: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  created_at: string;
  updated_at: string;
};

export type ReviewRow = {
  id: string;
  booking_id: string;
  student_id: string;
  mentor_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

// read from the mentor module tables
export type SlotRow = {
  id: string;
  mentor_id: string;
  start_time: string;
  end_time: string;
  status: "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
  version: number;
};

export type MentorRow = {
  id: string;
  user_id: string;
  hourly_rate_cents: number;
  currency: string;
  verification_status: "PENDING" | "APPROVED" | "REJECTED";
};
