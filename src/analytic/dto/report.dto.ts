import { z } from "zod";
import { pageQuerySchema } from "../../util/pagination";
import type { ReportStatus } from "../entity/report.entity";

export const createReportSchema = z.object({
  reportedUserId: z.string().uuid("must be a valid UUID").nullish(),
  bookingId: z.string().uuid("must be a valid UUID").nullish(),
  category: z.enum(["NO_SHOW", "INAPPROPRIATE_BEHAVIOR", "PAYMENT_ISSUE", "OTHER"], {
    error: "must be NO_SHOW, INAPPROPRIATE_BEHAVIOR, PAYMENT_ISSUE or OTHER",
  }),
  description: z.string({ error: "is required" }).trim().min(1, "must not be blank").max(2000),
});

export const listReportsQuerySchema = pageQuerySchema.extend({
  status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]).optional(),
});

export const updateReportSchema = z
  .object({
    status: z.enum(["UNDER_REVIEW", "RESOLVED", "DISMISSED"], { error: "must be UNDER_REVIEW, RESOLVED or DISMISSED" }),
    assignedAdminId: z.string().uuid("must be a valid UUID").nullish(),
    resolution: z.string().trim().max(2000).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.status !== "UNDER_REVIEW" && !v.resolution) {
      ctx.addIssue({ code: "custom", path: ["resolution"], message: "is required when RESOLVED or DISMISSED" });
    }
  });

export type CreateReportRequest = z.infer<typeof createReportSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
export type UpdateReportRequest = z.infer<typeof updateReportSchema>;

export type ReportResponse = {
  id: string;
  reportedBy: string;
  reporterName: string | null;
  reportedUserId: string | null;
  reportedUserName: string | null;
  bookingId: string | null;
  category: string;
  description: string;
  status: ReportStatus;
  assignedAdminId: string | null;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type AdminStatsResponse = {
  users: number;
  mentors: number;
  bookings: number;
  revenueCents: number;
  currency: string;
};
