import { z } from "zod";
import { pageQuerySchema } from "../../util/pagination";

const phone = z.string().regex(/^\+?\d{7,15}$/, "must be 7 to 15 digits, may start with +");

export const updateMeSchema = z.object({
  firstName: z.string().trim().min(1, "must not be blank").max(100),
  lastName: z.string().trim().min(1, "must not be blank").max(100),
  phone: phone.nullish(),
  profileImageKey: z.string().max(500).nullish(),
});

export const listUsersQuerySchema = pageQuerySchema.extend({
  role: z.enum(["STUDENT", "MENTOR", "ADMIN"]).optional(),
  accountStatus: z.enum(["ACTIVE", "SUSPENDED", "DEACTIVATED"]).optional(),
  q: z.string().trim().min(1).optional(),
});

export const updateStatusSchema = z.object({
  accountStatus: z.enum(["ACTIVE", "SUSPENDED"], { error: "must be ACTIVE or SUSPENDED" }),
});

export type UpdateMeRequest = z.infer<typeof updateMeSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

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
