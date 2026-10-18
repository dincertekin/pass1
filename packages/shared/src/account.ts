import { z } from "zod";
import { authKeySchema, base64, base64OfLength, encryptedBlobSchema, kdfParamsSchema, kdfSaltSchema } from "./crypto";

// Request and response bodies for /account/*, plus the export file format.

/**
 * New key material for a new master password. The vault key itself doesn't change, it's only
 * re-encrypted, so no items need re-encrypting. `currentAuthKey` proves the old password.
 */
export const changePasswordRequestSchema = z.object({
  currentAuthKey: authKeySchema,
  newAuthKey: authKeySchema,
  newKdfSalt: kdfSaltSchema,
  newKdfParams: kdfParamsSchema,
  newWrappedVaultKey: encryptedBlobSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Deleting the account needs the master password again, not just a session. */
export const deleteAccountRequestSchema = z.object({
  authKey: authKeySchema,
});
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

export const sessionInfoSchema = z.object({
  id: z.string(),
  /** Milliseconds since 1970. */
  createdAt: z.int(),
  lastUsedAt: z.int(),
  /** The browser's User-Agent at login, for telling devices apart. */
  userAgent: z.string().nullable(),
  /** The session making this request. */
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const listSessionsResponseSchema = z.object({ sessions: z.array(sessionInfoSchema) });
export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>;

/** The largest export we'll try to open. No plan can hold more than this (Unlimited caps at 1 GB). */
const MAX_EXPORT_CIPHERTEXT_BYTES = 1024 * 1024 * 1024;

/**
 * An export file, checked before decrypting. The KDF bounds matter here too: a malicious
 * file could otherwise ask for so much Argon2 memory that the browser freezes.
 */
export const exportFileSchema = z.object({
  format: z.literal("pass1-export"),
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  kdfSalt: kdfSaltSchema,
  kdfParams: kdfParamsSchema,
  data: z.object({
    v: z.literal(1),
    iv: base64OfLength(12),
    ciphertext: base64.min(1).max(Math.ceil(MAX_EXPORT_CIPHERTEXT_BYTES / 3) * 4),
  }),
});
