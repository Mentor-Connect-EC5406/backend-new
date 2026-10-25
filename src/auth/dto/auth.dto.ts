import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email("must be a valid email").max(254),
  password: z.string().min(8, "must be at least 8 characters").max(128),
  role: z.enum(["STUDENT", "MENTOR"], { error: "must be STUDENT or MENTOR" }),
  firstName: z.string().trim().min(1, "must not be blank").max(100),
  lastName: z.string().trim().min(1, "must not be blank").max(100),
  phone: z
    .string()
    .regex(/^\+?\d{7,15}$/, "must be 7 to 15 digits, may start with +")
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "must not be blank"),
  password: z.string().min(1, "must not be blank"),
});

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;

export type UserResponse = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  profileImageKey: string | null;
  role: "STUDENT" | "MENTOR" | "ADMIN";
  accountStatus: "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = { token: string; user: UserResponse };
