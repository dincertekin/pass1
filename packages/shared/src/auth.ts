import { z } from "zod";
import { authKeySchema, encryptedBlobSchema, kdfParamsSchema, kdfSaltSchema } from "./crypto";
import { PLAN_IDS } from "./plans";
import { proofOfWorkSchema } from "./proof-of-work";

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

/**
 * Step 1 of creating an account: POST /auth/signup. The answer is always the same,
 * "check your inbox", whether or not the email already has an account.
 */
export const signupRequestSchema = z.object({
  email: emailSchema,
  // A solved puzzle from GET /auth/challenge, so sending sign-up emails in bulk costs real computing time.
  proofOfWork: proofOfWorkSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

/** The token in a sign-up link: 32 random bytes as base64url. */
export const signupTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Not a sign-up token");

/** POST /auth/signup/check: which email a sign-up link is for, before the master password is chosen. */
export const checkSignupRequestSchema = z.object({ signupToken: signupTokenSchema });
export const checkSignupResponseSchema = z.object({ email: z.string() });
export type CheckSignupResponse = z.infer<typeof checkSignupResponseSchema>;

/**
 * Sent by an app (never the web) to get a bearer token instead of a cookie. The server refuses
 * it from browsers. `deviceName` is shown in Settings → Devices, e.g. "Ada's iPhone".
 */
export const appSessionSchema = z.object({
  deviceName: z.string().trim().min(1).max(100),
});
export type AppSession = z.infer<typeof appSessionSchema>;

/** Step 2: POST /auth/register, from the page the sign-up link opens. The email comes from the token. */
export const registerRequestSchema = z.object({
  signupToken: signupTokenSchema,
  authKey: authKeySchema,
  kdfSalt: kdfSaltSchema,
  kdfParams: kdfParamsSchema,
  wrappedVaultKey: encryptedBlobSchema,
  appSession: appSessionSchema.optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  authKey: authKeySchema,
  appSession: appSessionSchema.optional(),
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
  /**
   * Only for apps that sent `appSession`: the bearer token for the Authorization header.
   * Keep it in the iOS Keychain or Android Keystore, never in plain storage.
   */
  sessionToken: z.string().optional(),
});
export type AccountResponse = z.infer<typeof accountResponseSchema>;
