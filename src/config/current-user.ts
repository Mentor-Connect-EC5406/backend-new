export type Role = "STUDENT" | "MENTOR" | "ADMIN";

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
};
