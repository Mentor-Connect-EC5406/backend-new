export type UserRow = {
  id: string;
  external_auth_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  profile_image_key: string | null;
  role: "STUDENT" | "MENTOR" | "ADMIN";
  account_status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  created_at: string;
  updated_at: string;
};
