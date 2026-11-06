import type { CurrentUser } from "../../config/current-user";
import { badRequest, conflict, forbidden, notFound } from "../../exception/api-error";
import * as mentors from "../../mentor/repository/mentor.repository";
import { isPublicMentor } from "../../mentor/service/mentor.service";
import { createNotification } from "../../notification/service/notification.service";
import { offsetOf, toPage, type Page } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type {
  CreateProgramGoalRequest,
  CreateProgramRequest,
  ListProgramsQuery,
  ListTasksQuery,
  NoteRequest,
  NoteResponse,
  ProgramGoalResponse,
  ProgramResponse,
  ProgramStatusRequest,
  ProgressRequest,
  ProgressResponse,
  TaskRequest,
  TaskResponse,
  TaskStatusRequest,
  UpdateProgramGoalRequest,
} from "../dto/program.dto";
import type { NoteRow, ProgramDetailRow, ProgramGoalRow, ProgramStatus, ProgressRow, TaskRow } from "../entity/program.entity";
import * as repo from "../repository/program.repository";

type Side = "STUDENT" | "MENTOR";

const toProgram = (p: ProgramDetailRow): ProgramResponse => ({
  id: p.id,
  studentId: p.student_id,
  studentName: `${p.student_first_name} ${p.student_last_name}`.trim(),
  mentorId: p.mentor_id,
  mentorName: `${p.mentor_first_name} ${p.mentor_last_name}`.trim(),
  title: p.title,
  description: p.description,
  durationMonths: p.duration_months,
  startDate: p.start_date,
  endDate: p.end_date,
  status: p.status,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

const toGoal = (g: ProgramGoalRow): ProgramGoalResponse => ({
  id: g.id,
  programId: g.program_id,
  title: g.title,
  description: g.description,
  targetDate: g.target_date,
  status: g.status,
  progressPercentage: g.progress_percentage,
});

const toTask = (t: TaskRow): TaskResponse => ({
  id: t.id,
  programId: t.program_id,
  goalId: t.goal_id,
  assignedBy: t.assigned_by,
  assignedTo: t.assigned_to,
  title: t.title,
  description: t.description,
  dueDate: t.due_date,
  priority: t.priority,
  status: t.status,
});

const toProgress = (p: ProgressRow): ProgressResponse => ({
  id: p.id,
  goalId: p.goal_id,
  studentId: p.student_id,
  percentage: p.percentage,
  description: p.description,
  createdAt: p.created_at,
});

const toNote = (n: NoteRow): NoteResponse => ({
  id: n.id,
  programId: n.program_id,
  mentorId: n.mentor_id,
  studentId: n.student_id,
  sessionId: n.session_id,
  content: n.content,
  visibility: n.visibility,
  createdAt: n.created_at,
});

const today = () => nowIso().slice(0, 10);

// start date plus whole months; a missing day (31 Feb) becomes the last day of that month
export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

async function load(db: D1Database, id: string): Promise<ProgramDetailRow> {
  const p = await repo.findDetail(db, id);
  if (!p) throw notFound("Program not found");
  return p;
}

// the caller's side in the program, 403 for everyone else
function sideOf(me: CurrentUser, p: ProgramDetailRow): Side {
  if (me.role === "STUDENT" && p.student_id === me.id) return "STUDENT";
  if (me.role === "MENTOR" && p.mentor_user_id === me.id) return "MENTOR";
  throw forbidden("You are not part of this program");
}

function requireSide(me: CurrentUser, p: ProgramDetailRow, side: Side) {
  if (sideOf(me, p) !== side) throw forbidden(side === "MENTOR" ? "Only the mentor can do this" : "Only the student can do this");
}

function requireActive(p: ProgramDetailRow) {
  if (p.status !== "ACTIVE") throw conflict("Program is not ACTIVE");
}

const notify = (db: D1Database, userId: string, type: string, title: string, message: string) =>
  createNotification(db, { userId, type, title, message });

export async function requestProgram(db: D1Database, me: CurrentUser, req: CreateProgramRequest): Promise<ProgramResponse> {
  const mentor = await mentors.findWithUserById(db, req.mentorId);
  if (!mentor || !isPublicMentor(mentor)) throw notFound("Mentor not found");
  if (req.startDate < today()) {
    throw badRequest("Validation failed", [{ field: "startDate", message: "must be today or later" }]);
  }
  if (await repo.findOpen(db, me.id, mentor.id)) throw conflict("You already have a PENDING or ACTIVE program with this mentor");

  const now = nowIso();
  const id = newId();
  try {
    await repo.insert(db, {
      id,
      student_id: me.id,
      mentor_id: mentor.id,
      title: req.title,
      description: req.description ?? null,
      duration_months: req.durationMonths,
      start_date: req.startDate,
      end_date: addMonths(req.startDate, req.durationMonths),
      status: "PENDING",
      created_at: now,
      updated_at: now,
    });
  } catch (e) {
    // two requests at the same time hit uq_programs_open
    if (String(e).includes("UNIQUE")) throw conflict("You already have a PENDING or ACTIVE program with this mentor");
    throw e;
  }
  const program = await load(db, id);
  await notify(db, mentor.user_id, "PROGRAM_REQUESTED", "New mentorship request", `${toProgram(program).studentName} requested "${program.title}" for ${program.duration_months} months`);
  return toProgram(program);
}

export async function listPrograms(db: D1Database, me: CurrentUser, q: ListProgramsQuery): Promise<Page<ProgramResponse>> {
  let by: { studentId?: string; mentorId?: string };
  if (me.role === "STUDENT") by = { studentId: me.id };
  else if (me.role === "MENTOR") {
    const mentor = await mentors.findByUserId(db, me.id);
    if (!mentor) return toPage([], q, 0);
    by = { mentorId: mentor.id };
  } else throw forbidden("Insufficient role");
  const { rows, total } = await repo.list(db, by, q.status, q.size, offsetOf(q));
  return toPage(rows.map(toProgram), q, total);
}

export async function getProgram(db: D1Database, me: CurrentUser, id: string): Promise<ProgramResponse> {
  const p = await load(db, id);
  sideOf(me, p);
  return toProgram(p);
}

async function move(db: D1Database, p: ProgramDetailRow, from: ProgramStatus[], to: ProgramStatus): Promise<ProgramDetailRow> {
  if (!(await repo.changeStatus(db, p.id, from, to, nowIso()))) throw conflict(`Program is ${p.status}`);
  return load(db, p.id);
}

export async function accept(db: D1Database, me: CurrentUser, id: string): Promise<ProgramResponse> {
  const p = await load(db, id);
  requireSide(me, p, "MENTOR");
  const updated = await move(db, p, ["PENDING"], "ACTIVE");
  await notify(db, p.student_id, "PROGRAM_ACCEPTED", "Mentorship request accepted", `${toProgram(p).mentorName} accepted "${p.title}", starting ${p.start_date}`);
  return toProgram(updated);
}

export async function decline(db: D1Database, me: CurrentUser, id: string): Promise<ProgramResponse> {
  const p = await load(db, id);
  requireSide(me, p, "MENTOR");
  const updated = await move(db, p, ["PENDING"], "DECLINED");
  await notify(db, p.student_id, "PROGRAM_DECLINED", "Mentorship request declined", `${toProgram(p).mentorName} declined "${p.title}"`);
  return toProgram(updated);
}

export async function changeStatus(db: D1Database, me: CurrentUser, id: string, req: ProgramStatusRequest): Promise<ProgramResponse> {
  const p = await load(db, id);
  const side = sideOf(me, p);
  const names = toProgram(p);
  if (req.status === "COMPLETED") {
    if (side !== "MENTOR") throw forbidden("Only the mentor can complete a program");
    const updated = await move(db, p, ["ACTIVE"], "COMPLETED");
    await notify(db, p.student_id, "PROGRAM_COMPLETED", "Program completed", `${names.mentorName} marked "${p.title}" as completed`);
    return toProgram(updated);
  }
  // a mentor declines a PENDING request instead of cancelling it
  const updated = await move(db, p, side === "STUDENT" ? ["PENDING", "ACTIVE"] : ["ACTIVE"], "CANCELLED");
  const [userId, by] = side === "STUDENT" ? [p.mentor_user_id, names.studentName] : [p.student_id, names.mentorName];
  await notify(db, userId, "PROGRAM_CANCELLED", "Program cancelled", `${by} cancelled "${p.title}"`);
  return toProgram(updated);
}

// cron: PENDING requests not accepted before their start date
export async function expirePendingPrograms(db: D1Database): Promise<void> {
  for (const p of await repo.findPendingStarted(db, today(), 100)) {
    if (!(await repo.changeStatus(db, p.id, ["PENDING"], "CANCELLED", nowIso()))) continue;
    await notify(db, p.student_id, "PROGRAM_CANCELLED", "Mentorship request expired", `"${p.title}" was not accepted before ${p.start_date} and was cancelled`);
  }
}

// goals
export async function addGoal(db: D1Database, me: CurrentUser, programId: string, req: CreateProgramGoalRequest): Promise<ProgramGoalResponse> {
  const p = await load(db, programId);
  requireSide(me, p, "MENTOR");
  requireActive(p);
  const now = nowIso();
  const goal: ProgramGoalRow = {
    id: newId(),
    program_id: p.id,
    title: req.title,
    description: req.description ?? null,
    target_date: req.targetDate ?? null,
    status: "NOT_STARTED",
    progress_percentage: 0,
    created_at: now,
    updated_at: now,
  };
  await repo.insertGoal(db, goal);
  return toGoal(goal);
}

export async function listGoals(db: D1Database, me: CurrentUser, programId: string): Promise<ProgramGoalResponse[]> {
  const p = await load(db, programId);
  sideOf(me, p);
  return (await repo.listGoals(db, p.id)).map(toGoal);
}

async function loadGoal(db: D1Database, id: string) {
  const goal = await repo.findGoal(db, id);
  if (!goal) throw notFound("Goal not found");
  return { goal, program: await load(db, goal.program_id) };
}

export async function updateGoal(db: D1Database, me: CurrentUser, id: string, req: UpdateProgramGoalRequest): Promise<ProgramGoalResponse> {
  const { goal, program } = await loadGoal(db, id);
  requireSide(me, program, "MENTOR");
  requireActive(program);
  const updated: ProgramGoalRow = {
    ...goal,
    title: req.title,
    description: req.description ?? null,
    target_date: req.targetDate ?? null,
    status: req.status ?? goal.status,
    updated_at: nowIso(),
  };
  await repo.updateGoal(db, updated);
  return toGoal(updated);
}

// tasks
export async function addTask(db: D1Database, me: CurrentUser, goalId: string, req: TaskRequest): Promise<TaskResponse> {
  const { goal, program } = await loadGoal(db, goalId);
  requireSide(me, program, "MENTOR");
  requireActive(program);
  const now = nowIso();
  const task: TaskRow = {
    id: newId(),
    program_id: program.id,
    goal_id: goal.id,
    assigned_by: me.id,
    assigned_to: program.student_id,
    title: req.title,
    description: req.description ?? null,
    due_date: req.dueDate ?? null,
    priority: req.priority ?? "MEDIUM",
    status: "TODO",
    created_at: now,
    updated_at: now,
  };
  await repo.insertTask(db, task);
  return toTask(task);
}

export async function listTasks(db: D1Database, me: CurrentUser, programId: string, q: ListTasksQuery): Promise<TaskResponse[]> {
  const p = await load(db, programId);
  sideOf(me, p);
  return (await repo.listTasks(db, p.id, q.status, q.goalId)).map(toTask);
}

async function loadTask(db: D1Database, id: string) {
  const task = await repo.findTask(db, id);
  if (!task) throw notFound("Task not found");
  return { task, program: await load(db, task.program_id) };
}

export async function updateTask(db: D1Database, me: CurrentUser, id: string, req: TaskRequest): Promise<TaskResponse> {
  const { task, program } = await loadTask(db, id);
  requireSide(me, program, "MENTOR");
  requireActive(program);
  const updated: TaskRow = {
    ...task,
    title: req.title,
    description: req.description ?? null,
    due_date: req.dueDate ?? null,
    priority: req.priority ?? task.priority,
    updated_at: nowIso(),
  };
  await repo.updateTask(db, updated);
  return toTask(updated);
}

export async function changeTaskStatus(db: D1Database, me: CurrentUser, id: string, req: TaskStatusRequest): Promise<TaskResponse> {
  const { task, program } = await loadTask(db, id);
  sideOf(me, program);
  requireActive(program);
  const updated: TaskRow = { ...task, status: req.status, updated_at: nowIso() };
  await repo.updateTask(db, updated);
  return toTask(updated);
}

// progress
export async function addProgress(db: D1Database, me: CurrentUser, goalId: string, req: ProgressRequest): Promise<ProgressResponse> {
  const { goal, program } = await loadGoal(db, goalId);
  requireSide(me, program, "STUDENT");
  requireActive(program);
  const row: ProgressRow = {
    id: newId(),
    goal_id: goal.id,
    student_id: me.id,
    percentage: req.percentage,
    description: req.description ?? null,
    created_at: nowIso(),
  };
  await repo.insertProgress(db, row);
  return toProgress(row);
}

export async function listProgress(db: D1Database, me: CurrentUser, goalId: string): Promise<ProgressResponse[]> {
  const { goal, program } = await loadGoal(db, goalId);
  sideOf(me, program);
  return (await repo.listProgress(db, goal.id)).map(toProgress);
}

// notes
export async function addNote(db: D1Database, me: CurrentUser, programId: string, req: NoteRequest): Promise<NoteResponse> {
  const p = await load(db, programId);
  requireSide(me, p, "MENTOR");
  requireActive(p);
  if (req.sessionId && !(await repo.sessionBetween(db, req.sessionId, p.mentor_id, p.student_id))) {
    throw badRequest("Validation failed", [{ field: "sessionId", message: "must be a session between this mentor and student" }]);
  }
  const note: NoteRow = {
    id: newId(),
    program_id: p.id,
    mentor_id: p.mentor_id,
    student_id: p.student_id,
    session_id: req.sessionId ?? null,
    content: req.content,
    visibility: req.visibility ?? "PRIVATE",
    created_at: nowIso(),
  };
  await repo.insertNote(db, note);
  return toNote(note);
}

export async function listNotes(db: D1Database, me: CurrentUser, programId: string): Promise<NoteResponse[]> {
  const p = await load(db, programId);
  const side = sideOf(me, p);
  return (await repo.listNotes(db, p.id, side === "STUDENT")).map(toNote);
}
