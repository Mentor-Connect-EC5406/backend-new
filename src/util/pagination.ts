import { z } from "zod";

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export type Page<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export const offsetOf = (q: PageQuery) => q.page * q.size;

export function toPage<T>(content: T[], q: PageQuery, totalElements: number): Page<T> {
  return { content, page: q.page, size: q.size, totalElements, totalPages: Math.ceil(totalElements / q.size) };
}
