import type { GoalRow } from "../entity/goal.entity";

export const findForStudent = (db: D1Database, id: string, studentId: string) =>
  db.prepare("SELECT * FROM student_goals WHERE id = ? AND student_id = ?").bind(id, studentId).first<GoalRow>();

export async function insert(db: D1Database, g: GoalRow) {
  await db
    .prepare(
      `INSERT INTO student_goals (id, student_id, title, target_date, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(g.id, g.student_id, g.title, g.target_date, g.progress, g.created_at, g.updated_at)
    .run();
}

export async function update(db: D1Database, g: GoalRow) {
  await db
    .prepare("UPDATE student_goals SET title = ?, target_date = ?, progress = ?, updated_at = ? WHERE id = ?")
    .bind(g.title, g.target_date, g.progress, g.updated_at, g.id)
    .run();
}

export async function remove(db: D1Database, id: string) {
  await db.prepare("DELETE FROM student_goals WHERE id = ?").bind(id).run();
}

export async function listByStudent(db: D1Database, studentId: string, limit: number, offset: number) {
  const [rows, count] = await db.batch([
    db
      .prepare("SELECT * FROM student_goals WHERE student_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?")
      .bind(studentId, limit, offset),
    db.prepare("SELECT COUNT(*) AS total FROM student_goals WHERE student_id = ?").bind(studentId),
  ]);
  return {
    rows: rows!.results as GoalRow[],
    total: (count!.results[0] as { total: number }).total,
  };
}
