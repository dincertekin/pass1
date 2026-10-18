import { z } from "zod";

/** Every error the API returns has this shape, so the web app handles them in one place. */
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "PLAN_LIMIT_REACHED",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
