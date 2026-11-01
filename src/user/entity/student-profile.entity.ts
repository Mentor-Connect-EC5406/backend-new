export type StudentProfileRow = {
  id: string;
  user_id: string;
  university: string | null;
  faculty: string | null;
  degree: string | null;
  academic_year: number | null;
  bio: string | null;
  interests: string | null;
  profile_extras: string;
  updated_at: string;
};
