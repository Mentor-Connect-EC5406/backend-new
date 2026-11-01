import type { CurrentUser } from "../../config/current-user";
import { notFound } from "../../exception/api-error";
import { offsetOf, toPage, type Page, type PageQuery } from "../../util/pagination";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type { CreateGoalRequest, GoalResponse, UpdateGoalRequest } from "../dto/goal.dto";
import type { GoalRow } from "../entity/goal.entity";
import * as repo from "../repository/goal.repository";

const toResponse = (g: GoalRow): GoalResponse => ({
  id: g.id,
  title: g.title,
  targetDate: g.target_date,
  progress: g.progress,
  createdAt: g.created_at,
  updatedAt: g.updated_at,
});

// another student's goal looks the same as a missing one
async function ownGoal(db: D1Database, me: CurrentUser, id: string): Promise<GoalRow> {
  const goal = await repo.findForStudent(db, id, me.id);
  if (!goal) throw notFound("Goal not found");
  return goal;
}

export async function listGoals(db: D1Database, me: CurrentUser, q: PageQuery): Promise<Page<GoalResponse>> {
  const { rows, total } = await repo.listByStudent(db, me.id, q.size, offsetOf(q));
  return toPage(rows.map(toResponse), q, total);
}

export async function createGoal(db: D1Database, me: CurrentUser, req: CreateGoalRequest): Promise<GoalResponse> {
  const now = nowIso();
  const goal: GoalRow = {
    id: newId(),
    student_id: me.id,
    title: req.title,
    target_date: req.targetDate ?? null,
    progress: req.progress ?? 0,
    created_at: now,
    updated_at: now,
  };
  await repo.insert(db, goal);
  return toResponse(goal);
}

export async function updateGoal(db: D1Database, me: CurrentUser, id: string, req: UpdateGoalRequest): Promise<GoalResponse> {
  const goal = await ownGoal(db, me, id);
  const updated: GoalRow = {
    ...goal,
    title: req.title ?? goal.title,
    target_date: req.targetDate === undefined ? goal.target_date : req.targetDate,
    progress: req.progress ?? goal.progress,
    updated_at: nowIso(),
  };
  await repo.update(db, updated);
  return toResponse(updated);
}

export async function deleteGoal(db: D1Database, me: CurrentUser, id: string): Promise<void> {
  await ownGoal(db, me, id);
  await repo.remove(db, id);
}
