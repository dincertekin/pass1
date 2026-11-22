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
  "BILLING_FAILED",
  "PROOF_OF_WORK_FAILED",
  "SIGNUP_LINK_INVALID",
  "EMAIL_NOT_SENT",
  "APP_UPDATE_REQUIRED",
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
