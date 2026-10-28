import { z } from "zod";
import { pageQuerySchema } from "../../util/pagination";

const phone = z.string().regex(/^\+?\d{7,15}$/, "must be 7 to 15 digits, may start with +");

export const updateMeSchema = z.object({
  firstName: z.string().trim().min(1, "must not be blank").max(100),
  lastName: z.string().trim().min(1, "must not be blank").max(100),
  phone: phone.nullish(),
  profileImageKey: z.string().max(500).nullish(),
});

export const registerUserSchema = z.object({
  role: z.enum(["STUDENT", "MENTOR"], { error: "must be STUDENT or MENTOR" }),
  firstName: z.string().trim().min(1, "must not be blank").max(100),
  lastName: z.string().trim().min(1, "must not be blank").max(100),
  phone: phone.optional(),
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
export type RegisterUserRequest = z.infer<typeof registerUserSchema>;
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

export const updateStudentProfileSchema = z.object({
  university: z.string().max(200).optional(),
  faculty: z.string().max(200).optional(),
  degree: z.string().max(200).optional(),
  academicYear: z.number().int("must be a whole number").min(1, "must be 1 to 10").max(10, "must be 1 to 10").optional(),
  bio: z.string().max(2000).optional(),
  interests: z.string().max(1000).optional(),
});

export const avatarUploadUrlSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"], {
    error: "must be image/jpeg, image/png or image/webp",
  }),
});

export type UpdateStudentProfileRequest = z.infer<typeof updateStudentProfileSchema>;
export type AvatarUploadUrlRequest = z.infer<typeof avatarUploadUrlSchema>;

export type StudentProfileResponse = {
  id: string;
  userId: string;
  university: string | null;
  faculty: string | null;
  degree: string | null;
  academicYear: number | null;
  bio: string | null;
  interests: string | null;
  updatedAt: string;
};
