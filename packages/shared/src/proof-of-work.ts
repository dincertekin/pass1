import { z } from "zod";

// A small puzzle the browser solves before creating an account, instead of a third-party CAPTCHA.
// The server hands out a signed challenge; the browser tries nonces 0, 1, 2... until
// SHA-256("<challenge>:<nonce>") starts with enough zero bits. Checking takes one hash.
// A person waits about a second. A script creating thousands of accounts pays for each one.

/** GET /auth/challenge */
export const challengeResponseSchema = z.object({
  challenge: z.string().min(1).max(300),
  /** How many leading zero bits the hash needs. Each extra bit doubles the work. */
  difficultyBits: z.int().min(1).max(32),
});
export type ChallengeResponse = z.infer<typeof challengeResponseSchema>;

/** Sent with the request the puzzle protects (registration). */
export const proofOfWorkSchema = z.object({
  challenge: z.string().min(1).max(300),
  nonce: z.int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export type ProofOfWork = z.infer<typeof proofOfWorkSchema>;

/** The exact text that gets hashed. Input: "abc", 42. Output: "abc:42". */
export function proofOfWorkInput(challenge: string, nonce: number): string {
  return `${challenge}:${nonce}`;
}

/**
 * Whether a hash starts with at least `bits` zero bits.
 * Input: a SHA-256 digest and e.g. 19. Output: true or false.
 */
export function hasLeadingZeroBits(digest: Uint8Array, bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  for (let i = 0; i < fullBytes; i++) {
    if (digest[i] !== 0) return false;
  }
  const remainingBits = bits % 8;
  if (remainingBits === 0) return true;
  // For 3 remaining bits the next byte must be below 0b0010_0000, i.e. its top 3 bits are zero.
  return digest[fullBytes]! >> (8 - remainingBits) === 0;
}
