import type { CurrentUser } from "../../config/current-user";
import { badRequest, conflict, notFound } from "../../exception/api-error";
import { newId } from "../../util/uuid";
import type {
  CategoryResponse,
  CreateCategoryRequest,
  CreateExpertiseRequest,
  ExpertiseResponse,
  MentorExpertiseResponse,
  ReplaceExpertisesRequest,
} from "../dto/mentor.dto";
import * as repo from "../repository/expertise.repository";
import * as mentorRepo from "../repository/mentor.repository";
import { requireMentor, toExpertiseResponses } from "./mentor.service";

const isUnique = (e: unknown) => String(e).includes("UNIQUE");

export async function listCategories(db: D1Database): Promise<CategoryResponse[]> {
  const { categories, expertises } = await repo.listCategories(db);
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    expertises: expertises.filter((e) => e.category_id === c.id).map((e) => ({ expertiseId: e.id, name: e.name })),
  }));
}

export async function createCategory(db: D1Database, req: CreateCategoryRequest): Promise<CategoryResponse> {
  const id = newId();
  try {
    await repo.insertCategory(db, id, req.name, req.description ?? null);
  } catch (e) {
    if (isUnique(e)) throw conflict("Category name already exists");
    throw e;
  }
  return { id, name: req.name, description: req.description ?? null, expertises: [] };
}

export async function createExpertise(
  db: D1Database,
  categoryId: string,
  req: CreateExpertiseRequest,
): Promise<ExpertiseResponse> {
  if (!(await repo.findCategory(db, categoryId))) throw notFound("Category not found");
  const id = newId();
  try {
    await repo.insertExpertise(db, id, categoryId, req.name, req.description ?? null);
  } catch (e) {
    if (isUnique(e)) throw conflict("Expertise name already exists in this category");
    throw e;
  }
  return { id, categoryId, name: req.name, description: req.description ?? null };
}

export async function replaceMyExpertises(
  db: D1Database,
  me: CurrentUser,
  req: ReplaceExpertisesRequest,
): Promise<{ expertises: MentorExpertiseResponse[] }> {
  const mentor = await requireMentor(db, me.id);
  const ids = req.expertises.map((i) => i.expertiseId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest("Validation failed", [{ field: "expertises", message: "must not contain duplicate expertiseId" }]);
  }
  if ((await repo.countExistingExpertises(db, ids)) !== ids.length) {
    throw badRequest("Validation failed", [{ field: "expertises", message: "contains an unknown expertiseId" }]);
  }
  await repo.replaceMentorExpertises(db, mentor.id, req.expertises);
  return { expertises: toExpertiseResponses(await mentorRepo.findExpertises(db, [mentor.id])) };
}
