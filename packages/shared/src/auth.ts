import { z } from "zod";
import { authKeySchema, encryptedBlobSchema, kdfParamsSchema, kdfSaltSchema } from "./crypto";
import { PLAN_IDS } from "./plans";

// Request and response bodies for /auth/*. The API validates requests with these,
// and the web app uses the inferred types, so both sides always agree.

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const preloginRequestSchema = z.object({ email: emailSchema });
export type PreloginRequest = z.infer<typeof preloginRequestSchema>;

/** Returned for every email, registered or not, so the response can't reveal who has an account. */
export const preloginResponseSchema = z.object({
  kdfSalt: kdfSaltSchema,
  kdfParams: kdfParamsSchema,
});
export type PreloginResponse = z.infer<typeof preloginResponseSchema>;

export const registerRequestSchema = z.object({
  email: emailSchema,
  authKey: authKeySchema,
  kdfSalt: kdfSaltSchema,
  kdfParams: kdfParamsSchema,
  wrappedVaultKey: encryptedBlobSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  authKey: authKeySchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Everything the browser needs to unlock the vault after it has the master password.
 * Returned by register, login and GET /auth/me (after a page reload the session survives,
 * but the keys don't, so the user re-enters the master password and unlocks with this).
 */
export const accountResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    email: z.string(),
    plan: z.enum(PLAN_IDS),
  }),
  kdfSalt: kdfSaltSchema,
  kdfParams: kdfParamsSchema,
  wrappedVaultKey: encryptedBlobSchema,
});
export type AccountResponse = z.infer<typeof accountResponseSchema>;
