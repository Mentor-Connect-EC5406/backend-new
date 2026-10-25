export type VerificationStatus = "PENDING" | "APPROVED" | "REJECTED";
export type SlotStatus = "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";

export type MentorRow = {
  id: string;
  user_id: string;
  title: string | null;
  organization: string | null;
  industry: string | null;
  bio: string | null;
  experience_years: number;
  hourly_rate_cents: number;
  currency: string;
  rating_avg: number;
  rating_count: number;
  verification_status: VerificationStatus;
  created_at: string;
  updated_at: string;
};

export type MentorWithUserRow = MentorRow & {
  first_name: string;
  last_name: string;
  profile_image_key: string | null;
};

export type MentorExpertiseRow = {
  mentor_id: string;
  expertise_id: string;
  name: string;
  category_name: string;
  proficiency: string;
};

export type CategoryRow = { id: string; name: string; description: string | null };

export type ExpertiseRow = { id: string; category_id: string; name: string; description: string | null };

export type SlotRow = {
  id: string;
  mentor_id: string;
  start_time: string;
  end_time: string;
  timezone: string;
  status: SlotStatus;
  version: number;
  created_at: string;
  updated_at: string;
};

export type VerificationRow = {
  id: string;
  mentor_id: string;
  document_key: string;
  status: VerificationStatus;
  reviewed_by: string | null;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};
