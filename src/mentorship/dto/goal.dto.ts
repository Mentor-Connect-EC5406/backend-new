import { z } from "zod";

const title = z.string({ error: "is required" }).trim().min(1, "must not be blank").max(100);
const targetDate = z.iso.date({ error: "must be YYYY-MM-DD" }).nullable();
const progress = z.number({ error: "must be a number from 0 to 100" }).int("must be a whole number").min(0).max(100);

export const createGoalSchema = z.object({
  title,
  targetDate: targetDate.optional(),
  progress: progress.optional(),
});

export const updateGoalSchema = createGoalSchema.partial();

export type CreateGoalRequest = z.infer<typeof createGoalSchema>;
export type UpdateGoalRequest = z.infer<typeof updateGoalSchema>;

export type GoalResponse = {
  id: string;
  title: string;
  targetDate: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
};
