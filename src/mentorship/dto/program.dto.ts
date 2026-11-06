import { z } from "zod";
import { pageQuerySchema } from "../../util/pagination";
import type { NoteVisibility, ProgramGoalStatus, ProgramStatus, TaskPriority, TaskStatus } from "../entity/program.entity";

const title = z.string({ error: "is required" }).trim().min(1, "must not be blank").max(150);
const description = z.string().max(2000).nullish();
const date = z.iso.date({ error: "must be YYYY-MM-DD" });
const uuid = z.string({ error: "is required" }).uuid("must be a valid UUID");

const PROGRAM_STATUSES = ["PENDING", "ACTIVE", "COMPLETED", "CANCELLED", "DECLINED"] as const;
const GOAL_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

export const createProgramSchema = z.object({
  mentorId: uuid,
  title,
  description,
  durationMonths: z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(48)], { error: "must be 6, 12, 24 or 48" }),
  startDate: date,
});

export const listProgramsQuerySchema = pageQuerySchema.extend({
  status: z.enum(PROGRAM_STATUSES, { error: "must be PENDING, ACTIVE, COMPLETED, CANCELLED or DECLINED" }).optional(),
});

export const programStatusSchema = z.object({
  status: z.enum(["COMPLETED", "CANCELLED"], { error: "must be COMPLETED or CANCELLED" }),
});

export const createProgramGoalSchema = z.object({ title, description, targetDate: date.nullish() });

export const updateProgramGoalSchema = createProgramGoalSchema.extend({
  status: z.enum(GOAL_STATUSES, { error: "must be NOT_STARTED, IN_PROGRESS or COMPLETED" }).optional(),
});

export const taskSchema = z.object({
  title,
  description,
  dueDate: date.nullish(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"], { error: "must be LOW, MEDIUM or HIGH" }).optional(),
});

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES, { error: "must be TODO, IN_PROGRESS, DONE or CANCELLED" }),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES, { error: "must be TODO, IN_PROGRESS, DONE or CANCELLED" }).optional(),
  goalId: uuid.optional(),
});

export const progressSchema = z.object({
  percentage: z.number({ error: "must be a number from 0 to 100" }).int("must be a whole number").min(0).max(100),
  description: z.string().max(1000).nullish(),
});

export const noteSchema = z.object({
  content: z.string({ error: "is required" }).trim().min(1, "must not be blank").max(2000),
  visibility: z.enum(["PRIVATE", "SHARED"], { error: "must be PRIVATE or SHARED" }).optional(),
  sessionId: uuid.nullish(),
});

export type CreateProgramRequest = z.infer<typeof createProgramSchema>;
export type ListProgramsQuery = z.infer<typeof listProgramsQuerySchema>;
export type ProgramStatusRequest = z.infer<typeof programStatusSchema>;
export type CreateProgramGoalRequest = z.infer<typeof createProgramGoalSchema>;
export type UpdateProgramGoalRequest = z.infer<typeof updateProgramGoalSchema>;
export type TaskRequest = z.infer<typeof taskSchema>;
export type TaskStatusRequest = z.infer<typeof taskStatusSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type ProgressRequest = z.infer<typeof progressSchema>;
export type NoteRequest = z.infer<typeof noteSchema>;

export type ProgramResponse = {
  id: string;
  studentId: string;
  studentName: string;
  mentorId: string;
  mentorName: string;
  title: string;
  description: string | null;
  durationMonths: number;
  startDate: string;
  endDate: string;
  status: ProgramStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProgramGoalResponse = {
  id: string;
  programId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: ProgramGoalStatus;
  progressPercentage: number;
};

export type TaskResponse = {
  id: string;
  programId: string;
  goalId: string | null;
  assignedBy: string;
  assignedTo: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
};

export type ProgressResponse = {
  id: string;
  goalId: string;
  studentId: string;
  percentage: number;
  description: string | null;
  createdAt: string;
};

export type NoteResponse = {
  id: string;
  programId: string;
  mentorId: string;
  studentId: string;
  sessionId: string | null;
  content: string;
  visibility: NoteVisibility;
  createdAt: string;
};
