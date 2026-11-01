export type ReportStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";

export type ReportRow = {
  id: string;
  reported_by: string;
  reported_user_id: string | null;
  booking_id: string | null;
  category: string;
  description: string;
  status: ReportStatus;
  assigned_admin_id: string | null;
  resolution: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type ReportDetailRow = ReportRow & {
  reporter_name: string | null;
  reported_user_name: string | null;
};

export type AdminStatsRow = {
  users: number;
  mentors: number;
  bookings: number;
  revenue_cents: number;
};
