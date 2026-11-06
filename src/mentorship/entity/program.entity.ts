export type ProgramStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "DECLINED";
export type ProgramGoalStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type NoteVisibility = "PRIVATE" | "SHARED";

export type ProgramRow = {
  id: string;
  student_id: string;
  mentor_id: string;
  title: string;
  description: string | null;
  duration_months: number;
  start_date: string;
  end_date: string;
  status: ProgramStatus;
  created_at: string;
  updated_at: string;
};

export type ProgramDetailRow = ProgramRow & {
  student_first_name: string;
  student_last_name: string;
  mentor_user_id: string;
  mentor_first_name: string;
  mentor_last_name: string;
};

export type ProgramGoalRow = {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  target_date: string | null;
  status: ProgramGoalStatus;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  program_id: string;
  goal_id: string | null;
  assigned_by: string;
  assigned_to: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
};

export type ProgressRow = {
  id: string;
  goal_id: string;
  student_id: string;
  percentage: number;
  description: string | null;
  created_at: string;
};

export type NoteRow = {
  id: string;
  program_id: string;
  mentor_id: string;
  student_id: string;
  session_id: string | null;
  content: string;
  visibility: NoteVisibility;
  created_at: string;
};
