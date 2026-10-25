import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { ApiError, type FieldError } from "./api-error";
import { nowIso } from "../util/time";

function body(c: Context, status: number, error: string, message: string, fieldErrors?: FieldError[]) {
  const json: Record<string, unknown> = {
    timestamp: nowIso(),
    status,
    error,
    message,
    path: new URL(c.req.url).pathname,
  };
  if (fieldErrors) json.fieldErrors = fieldErrors;
  return c.json(json, status as 400);
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) return body(c, err.status, err.error, err.message, err.fieldErrors);
  console.error(err);
  return body(c, 500, "INTERNAL_SERVER_ERROR", "Unexpected error");
};

export const notFoundHandler: NotFoundHandler = (c) => body(c, 404, "NOT_FOUND", "Route not found");
