import { z } from "zod";
import { pageQuerySchema } from "../../util/pagination";
import type { SlotStatus, VerificationStatus } from "../entity/mentor.entity";

const instant = z.iso
  .datetime({ offset: true, error: "must be an ISO-8601 timestamp" })
  .transform((s) => new Date(s).toISOString());

const timezone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { error: "must be a valid IANA timezone" },
);

// profile
export const upsertMentorSchema = z.object({
  title: z.string().trim().min(1, "must not be blank").max(150),
  organization: z.string().nullish(),
  industry: z.string().nullish(),
  bio: z.string().nullish(),
  experienceYears: z.number().int().min(0, "must be 0 or more"),
  hourlyRateCents: z.number().int().min(0, "must be 0 or more"),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, "must be 3 letters")
    .transform((s) => s.toUpperCase())
    .optional(),
});

export const searchMentorsQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  expertiseId: z.string().min(1).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
});

export type UpsertMentorRequest = z.infer<typeof upsertMentorSchema>;
export type SearchMentorsQuery = z.infer<typeof searchMentorsQuerySchema>;

// expertise
export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "must not be blank").max(100),
  description: z.string().nullish(),
});

export const createExpertiseSchema = z.object({
  name: z.string().trim().min(1, "must not be blank").max(100),
  description: z.string().nullish(),
});

export const replaceExpertisesSchema = z.object({
  expertises: z.array(
    z.object({
      expertiseId: z.string().min(1, "must not be blank"),
      proficiency: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"], {
        error: "must be BEGINNER, INTERMEDIATE, ADVANCED or EXPERT",
      }),
    }),
  ),
});

export type CreateCategoryRequest = z.infer<typeof createCategorySchema>;
export type CreateExpertiseRequest = z.infer<typeof createExpertiseSchema>;
export type ReplaceExpertisesRequest = z.infer<typeof replaceExpertisesSchema>;

// slots
const slotTimes = (v: { startTime: string; endTime: string }, ctx: z.RefinementCtx) => {
  if (new Date(v.startTime).getTime() <= Date.now()) {
    ctx.addIssue({ code: "custom", path: ["startTime"], message: "must be in the future" });
  }
  if (v.endTime <= v.startTime) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "must be after startTime" });
  }
};

export const createSlotSchema = z
  .object({ startTime: instant, endTime: instant, timezone: timezone.optional() })
  .superRefine(slotTimes);

export const updateSlotSchema = z
  .object({
    startTime: instant,
    endTime: instant,
    timezone: timezone.optional(),
    status: z.enum(["AVAILABLE", "BLOCKED"], { error: "must be AVAILABLE or BLOCKED" }).optional(),
  })
  .superRefine(slotTimes);

export const mySlotsQuerySchema = z.object({
  status: z.enum(["AVAILABLE", "HELD", "BOOKED", "BLOCKED"]).optional(),
  from: instant.optional(),
  to: instant.optional(),
});

export const publicSlotsQuerySchema = z.object({ from: instant.optional(), to: instant.optional() });

export type CreateSlotRequest = z.infer<typeof createSlotSchema>;
export type UpdateSlotRequest = z.infer<typeof updateSlotSchema>;
export type MySlotsQuery = z.infer<typeof mySlotsQuerySchema>;
export type PublicSlotsQuery = z.infer<typeof publicSlotsQuerySchema>;

// verification
export const submitVerificationSchema = z.object({ documentKey: z.string().min(1, "must not be blank").max(500) });

export const reviewVerificationSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED"], { error: "must be APPROVED or REJECTED" }),
    reviewNote: z.string().trim().nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "REJECTED" && !v.reviewNote) {
      ctx.addIssue({ code: "custom", path: ["reviewNote"], message: "is required when REJECTED" });
    }
  });

export const listVerificationsQuerySchema = pageQuerySchema.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export type SubmitVerificationRequest = z.infer<typeof submitVerificationSchema>;
export type ReviewVerificationRequest = z.infer<typeof reviewVerificationSchema>;
export type ListVerificationsQuery = z.infer<typeof listVerificationsQuerySchema>;

// responses
export type MentorSummary = {
  id: string;
  firstName: string;
  lastName: string;
  profileImageKey: string | null;
  title: string | null;
  organization: string | null;
  industry: string | null;
  experienceYears: number;
  hourlyRateCents: number;
  currency: string;
  ratingAvg: number;
  ratingCount: number;
  expertises: { id: string; name: string }[];
};

export type MentorExpertiseResponse = {
  expertiseId: string;
  name: string;
  categoryName: string;
  proficiency: string;
};

export type MentorResponse = Omit<MentorSummary, "expertises"> & {
  userId: string;
  bio: string | null;
  verificationStatus: VerificationStatus;
  expertises: MentorExpertiseResponse[];
  createdAt: string;
  updatedAt: string;
};

export type CategoryResponse = {
  id: string;
  name: string;
  description: string | null;
  expertises: { expertiseId: string; name: string }[];
};

export type ExpertiseResponse = { id: string; categoryId: string; name: string; description: string | null };

export type SlotResponse = {
  id: string;
  mentorId: string;
  startTime: string;
  endTime: string;
  timezone: string;
  status: SlotStatus;
};

export type VerificationResponse = {
  id: string;
  mentorId: string;
  documentKey: string;
  status: VerificationStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

export type AdminVerificationResponse = VerificationResponse & { documentUrl: string | null };

export const verificationUploadUrlSchema = z.object({
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"], {
    error: "must be application/pdf, image/jpeg or image/png",
  }),
});
