import type { z } from "zod";
import { badRequest } from "../exception/api-error";

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const json = await req.json().catch(() => {
    throw badRequest("Malformed JSON body");
  });
  return parse(schema, json);
}

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw badRequest(
    "Validation failed",
    result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  );
}
