import type { CurrentUser } from "../../config/current-user";
import { badRequest, conflict, notFound } from "../../exception/api-error";
import { nowIso } from "../../util/time";
import { newId } from "../../util/uuid";
import type {
  CreateSlotRequest,
  MySlotsQuery,
  PublicSlotsQuery,
  SlotResponse,
  UpdateSlotRequest,
} from "../dto/mentor.dto";
import type { SlotRow } from "../entity/mentor.entity";
import * as mentorRepo from "../repository/mentor.repository";
import * as repo from "../repository/slot.repository";
import { requireMentor } from "./mentor.service";

const DAY_MS = 24 * 60 * 60 * 1000;

const toResponse = (s: SlotRow): SlotResponse => ({
  id: s.id,
  mentorId: s.mentor_id,
  startTime: s.start_time,
  endTime: s.end_time,
  timezone: s.timezone,
  status: s.status,
});

const isUnique = (e: unknown) => String(e).includes("UNIQUE");

async function ownSlot(db: D1Database, mentorId: string, slotId: string): Promise<SlotRow> {
  const slot = await repo.findById(db, slotId);
  if (!slot || slot.mentor_id !== mentorId) throw notFound("Slot not found");
  return slot;
}

export async function createSlot(db: D1Database, me: CurrentUser, req: CreateSlotRequest): Promise<SlotResponse> {
  const mentor = await requireMentor(db, me.id);
  const id = newId();
  try {
    await repo.insert(db, {
      id,
      mentorId: mentor.id,
      startTime: req.startTime,
      endTime: req.endTime,
      timezone: req.timezone ?? "UTC",
      now: nowIso(),
    });
  } catch (e) {
    if (isUnique(e)) throw conflict("A slot with this start time already exists");
    throw e;
  }
  return toResponse((await repo.findById(db, id))!);
}

export async function listMySlots(db: D1Database, me: CurrentUser, q: MySlotsQuery): Promise<SlotResponse[]> {
  const mentor = await requireMentor(db, me.id);
  return (await repo.listOwn(db, mentor.id, q)).map(toResponse);
}

export async function updateSlot(
  db: D1Database,
  me: CurrentUser,
  slotId: string,
  req: UpdateSlotRequest,
): Promise<SlotResponse> {
  const mentor = await requireMentor(db, me.id);
  const slot = await ownSlot(db, mentor.id, slotId);
  if (slot.status !== "AVAILABLE" && slot.status !== "BLOCKED") throw conflict("Slot is " + slot.status);
  try {
    await repo.update(db, {
      id: slot.id,
      startTime: req.startTime,
      endTime: req.endTime,
      timezone: req.timezone ?? slot.timezone,
      status: req.status ?? slot.status,
      now: nowIso(),
    });
  } catch (e) {
    if (isUnique(e)) throw conflict("A slot with this start time already exists");
    throw e;
  }
  return toResponse((await repo.findById(db, slot.id))!);
}

export async function deleteSlot(db: D1Database, me: CurrentUser, slotId: string): Promise<void> {
  const mentor = await requireMentor(db, me.id);
  const slot = await ownSlot(db, mentor.id, slotId);
  if (slot.status === "HELD" || slot.status === "BOOKED") throw conflict("Slot is " + slot.status);
  await repo.remove(db, slot.id);
}

// only APPROVED mentors are bookable
export async function listPublicSlots(db: D1Database, mentorId: string, q: PublicSlotsQuery): Promise<SlotResponse[]> {
  const mentor = await mentorRepo.findWithUserById(db, mentorId);
  if (!mentor || mentor.verification_status !== "APPROVED") throw notFound("Mentor not found");

  const now = Date.now();
  const from = q.from ?? new Date(now).toISOString();
  const to = q.to ?? new Date(now + 30 * DAY_MS).toISOString();
  const span = new Date(to).getTime() - new Date(from).getTime();
  if (span <= 0) throw badRequest("Validation failed", [{ field: "to", message: "must be after from" }]);
  if (span > 31 * DAY_MS) throw badRequest("Validation failed", [{ field: "to", message: "range must be 31 days or less" }]);

  // never list slots that already started
  const start = from > nowIso() ? from : nowIso();
  return (await repo.listAvailable(db, mentorId, start, to)).map(toResponse);
}
