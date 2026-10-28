export type Role = "STUDENT" | "MENTOR" | "ADMIN";

export type CurrentUser = {
  id: string;
  email: string;
  role: Role;
};

// who the token belongs to, before the users row is looked up
export type Identity = {
  sub: string;
  email: string | null;
};
