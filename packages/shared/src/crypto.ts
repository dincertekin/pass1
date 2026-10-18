import { z } from "zod";

// Schemas for the encrypted data the server stores. The server can't check what's inside,
// so it checks the shape and the sizes, nothing more.

const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, "Must be base64");

/** Base64 of exactly `bytes` bytes. */
function base64OfLength(bytes: number) {
  return base64.length(Math.ceil(bytes / 3) * 4);
}

/** Largest encrypted item the server accepts. Real items are well under 4 KiB; attachments will be stored separately. */
export const MAX_ITEM_CIPHERTEXT_BYTES = 64 * 1024;

export const encryptedBlobSchema = z.object({
  v: z.literal(1),
  iv: base64OfLength(12),
  ciphertext: base64.min(1).max(Math.ceil(MAX_ITEM_CIPHERTEXT_BYTES / 3) * 4),
});
export type EncryptedBlob = z.infer<typeof encryptedBlobSchema>;

/**
 * Argon2id cost bounds. The minimum stops a client from registering with weak settings
 * (they must match DEFAULT_KDF_PARAMS in @pass1/crypto or be stronger). The maximum stops
 * the server from sending settings that would freeze a user's browser.
 */
export const KDF_LIMITS = {
  memoryKiB: { min: 64 * 1024, max: 1024 * 1024 },
  iterations: { min: 3, max: 20 },
  parallelism: { min: 1, max: 8 },
} as const;

export const kdfParamsSchema = z.object({
  memoryKiB: z.int().min(KDF_LIMITS.memoryKiB.min).max(KDF_LIMITS.memoryKiB.max),
  iterations: z.int().min(KDF_LIMITS.iterations.min).max(KDF_LIMITS.iterations.max),
  parallelism: z.int().min(KDF_LIMITS.parallelism.min).max(KDF_LIMITS.parallelism.max),
});
export type KdfParams = z.infer<typeof kdfParamsSchema>;

/** 16 random bytes, generated in the browser at registration. */
export const kdfSaltSchema = base64OfLength(16);

/** 32 bytes derived from the master password. The server hashes it again and never stores it. */
export const authKeySchema = base64OfLength(32);
