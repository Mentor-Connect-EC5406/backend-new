export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public error: string,
    message: string,
    public fieldErrors?: FieldError[],
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fieldErrors?: FieldError[]) =>
  new ApiError(400, "BAD_REQUEST", message, fieldErrors);
export const unauthorized = (message = "Unauthorized") => new ApiError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "Forbidden") => new ApiError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new ApiError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);
