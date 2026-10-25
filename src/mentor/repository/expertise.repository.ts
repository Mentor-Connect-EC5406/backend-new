import type { CategoryRow, ExpertiseRow } from "../entity/mentor.entity";

export async function listCategories(db: D1Database) {
  const [cats, exps] = await Promise.all([
    db.prepare("SELECT id, name, description FROM expertise_categories ORDER BY name").all<CategoryRow>(),
    db.prepare("SELECT id, category_id, name, description FROM expertises ORDER BY name").all<ExpertiseRow>(),
  ]);
  return { categories: cats.results, expertises: exps.results };
}

export const findCategory = (db: D1Database, id: string) =>
  db.prepare("SELECT id, name, description FROM expertise_categories WHERE id = ?").bind(id).first<CategoryRow>();

export async function insertCategory(db: D1Database, id: string, name: string, description: string | null) {
  await db.prepare("INSERT INTO expertise_categories (id, name, description) VALUES (?, ?, ?)").bind(id, name, description).run();
}

export async function insertExpertise(db: D1Database, id: string, categoryId: string, name: string, description: string | null) {
  await db
    .prepare("INSERT INTO expertises (id, category_id, name, description) VALUES (?, ?, ?, ?)")
    .bind(id, categoryId, name, description)
    .run();
}

export async function countExistingExpertises(db: D1Database, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const marks = ids.map(() => "?").join(",");
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM expertises WHERE id IN (${marks})`)
    .bind(...ids)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function replaceMentorExpertises(
  db: D1Database,
  mentorId: string,
  items: { expertiseId: string; proficiency: string }[],
) {
  const stmts = [db.prepare("DELETE FROM mentor_expertises WHERE mentor_id = ?").bind(mentorId)];
  for (const i of items) {
    stmts.push(
      db
        .prepare("INSERT INTO mentor_expertises (mentor_id, expertise_id, proficiency) VALUES (?, ?, ?)")
        .bind(mentorId, i.expertiseId, i.proficiency),
    );
  }
  await db.batch(stmts);
}
