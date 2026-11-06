import type {
  NoteRow,
  ProgramDetailRow,
  ProgramGoalRow,
  ProgramRow,
  ProgramStatus,
  ProgressRow,
  TaskRow,
} from "../entity/program.entity";

const DETAIL = `SELECT p.*, su.first_name AS student_first_name, su.last_name AS student_last_name,
                       m.user_id AS mentor_user_id, mu.first_name AS mentor_first_name, mu.last_name AS mentor_last_name
                FROM mentorship_programs p
                JOIN users su ON su.id = p.student_id
                JOIN mentors m ON m.id = p.mentor_id
                JOIN users mu ON mu.id = m.user_id`;

export const findDetail = (db: D1Database, id: string) =>
  db.prepare(`${DETAIL} WHERE p.id = ?`).bind(id).first<ProgramDetailRow>();

export const findOpen = (db: D1Database, studentId: string, mentorId: string) =>
  db
    .prepare("SELECT id FROM mentorship_programs WHERE student_id = ? AND mentor_id = ? AND status IN ('PENDING', 'ACTIVE') LIMIT 1")
    .bind(studentId, mentorId)
    .first<{ id: string }>();

export async function insert(db: D1Database, p: ProgramRow) {
  await db
    .prepare(
      `INSERT INTO mentorship_programs (id, student_id, mentor_id, title, description, duration_months, start_date, end_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(p.id, p.student_id, p.mentor_id, p.title, p.description, p.duration_months, p.start_date, p.end_date, p.status, p.created_at, p.updated_at)
    .run();
}

// only moves from one of the given statuses, false when another request changed it first
export async function changeStatus(db: D1Database, id: string, from: ProgramStatus[], to: ProgramStatus, now: string) {
  const marks = from.map(() => "?").join(",");
  const res = await db
    .prepare(`UPDATE mentorship_programs SET status = ?, updated_at = ? WHERE id = ? AND status IN (${marks})`)
    .bind(to, now, id, ...from)
    .run();
  return res.meta.changes > 0;
}

export async function list(db: D1Database, by: { studentId?: string; mentorId?: string }, status: string | undefined, limit: number, offset: number) {
  const where = [by.studentId ? "p.student_id = ?" : "p.mentor_id = ?"];
  const params: unknown[] = [by.studentId ?? by.mentorId];
  if (status) {
    where.push("p.status = ?");
    params.push(status);
  }
  const clause = `WHERE ${where.join(" AND ")}`;
  const [rows, count] = await db.batch([
    db.prepare(`${DETAIL} ${clause} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`).bind(...params, limit, offset),
    db.prepare(`SELECT COUNT(*) AS total FROM mentorship_programs p ${clause}`).bind(...params),
  ]);
  return {
    rows: rows!.results as ProgramDetailRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}

export const findPendingStarted = (db: D1Database, today: string, limit: number) =>
  db
    .prepare(`${DETAIL} WHERE p.status = 'PENDING' AND p.start_date < ? ORDER BY p.start_date LIMIT ?`)
    .bind(today, limit)
    .all<ProgramDetailRow>()
    .then((r) => r.results);

// goals
export const findGoal = (db: D1Database, id: string) =>
  db.prepare("SELECT * FROM goals WHERE id = ?").bind(id).first<ProgramGoalRow>();

export const listGoals = (db: D1Database, programId: string) =>
  db
    .prepare("SELECT * FROM goals WHERE program_id = ? ORDER BY created_at, id")
    .bind(programId)
    .all<ProgramGoalRow>()
    .then((r) => r.results);

export async function insertGoal(db: D1Database, g: ProgramGoalRow) {
  await db
    .prepare(
      `INSERT INTO goals (id, program_id, title, description, target_date, status, progress_percentage, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(g.id, g.program_id, g.title, g.description, g.target_date, g.status, g.progress_percentage, g.created_at, g.updated_at)
    .run();
}

export async function updateGoal(db: D1Database, g: ProgramGoalRow) {
  await db
    .prepare("UPDATE goals SET title = ?, description = ?, target_date = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(g.title, g.description, g.target_date, g.status, g.updated_at, g.id)
    .run();
}

// tasks
export const findTask = (db: D1Database, id: string) => db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>();

export async function listTasks(db: D1Database, programId: string, status?: string, goalId?: string) {
  const where = ["program_id = ?"];
  const params: unknown[] = [programId];
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (goalId) {
    where.push("goal_id = ?");
    params.push(goalId);
  }
  const res = await db
    .prepare(`SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY due_date IS NULL, due_date, created_at, id`)
    .bind(...params)
    .all<TaskRow>();
  return res.results;
}

export async function insertTask(db: D1Database, t: TaskRow) {
  await db
    .prepare(
      `INSERT INTO tasks (id, program_id, goal_id, assigned_by, assigned_to, title, description, due_date, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(t.id, t.program_id, t.goal_id, t.assigned_by, t.assigned_to, t.title, t.description, t.due_date, t.priority, t.status, t.created_at, t.updated_at)
    .run();
}

export async function updateTask(db: D1Database, t: TaskRow) {
  await db
    .prepare("UPDATE tasks SET title = ?, description = ?, due_date = ?, priority = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(t.title, t.description, t.due_date, t.priority, t.status, t.updated_at, t.id)
    .run();
}

// progress: the update and the goal's latest percentage in one batch
export async function insertProgress(db: D1Database, p: ProgressRow) {
  await db.batch([
    db
      .prepare("INSERT INTO progress_updates (id, goal_id, student_id, percentage, description, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(p.id, p.goal_id, p.student_id, p.percentage, p.description, p.created_at),
    db.prepare("UPDATE goals SET progress_percentage = ?, updated_at = ? WHERE id = ?").bind(p.percentage, p.created_at, p.goal_id),
  ]);
}

export const listProgress = (db: D1Database, goalId: string) =>
  db
    .prepare("SELECT * FROM progress_updates WHERE goal_id = ? ORDER BY created_at DESC, id")
    .bind(goalId)
    .all<ProgressRow>()
    .then((r) => r.results);

// notes
export async function insertNote(db: D1Database, n: NoteRow) {
  await db
    .prepare(
      `INSERT INTO mentor_notes (id, program_id, mentor_id, student_id, session_id, content, visibility, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(n.id, n.program_id, n.mentor_id, n.student_id, n.session_id, n.content, n.visibility, n.created_at)
    .run();
}

export const listNotes = (db: D1Database, programId: string, sharedOnly: boolean) =>
  db
    .prepare(
      `SELECT * FROM mentor_notes WHERE program_id = ? ${sharedOnly ? "AND visibility = 'SHARED'" : ""} ORDER BY created_at DESC, id`,
    )
    .bind(programId)
    .all<NoteRow>()
    .then((r) => r.results);

// a session of a booking between this mentor and student
export const sessionBetween = (db: D1Database, sessionId: string, mentorId: string, studentId: string) =>
  db
    .prepare(
      `SELECT s.id FROM mentoring_sessions s JOIN bookings b ON b.id = s.booking_id
       WHERE s.id = ? AND b.mentor_id = ? AND b.student_id = ?`,
    )
    .bind(sessionId, mentorId, studentId)
    .first<{ id: string }>();
