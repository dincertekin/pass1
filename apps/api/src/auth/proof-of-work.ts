// Sign-up puzzles (proof of work), the server side. What the browser does is described in
// packages/shared/src/proof-of-work.ts.
//
// A challenge looks like "1795000000000.19.<random>.<signature>": when it expires, how hard it
// is, a random ID, and an HMAC over those three. The signature means the server needn't store
// challenges it hands out, and nobody can make an easier one or extend its lifetime.
// Only used challenges are stored, so each solution creates one account at most.

import { hasLeadingZeroBits, proofOfWorkInput, type ChallengeResponse, type ProofOfWork } from "@pass1/shared";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { usedChallenges } from "../db/schema.js";

// Long enough to fill in the sign-up form after the page loads; short enough that nobody can
// stockpile solved puzzles for later.
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const RANDOM_ID_BYTES = 16;

// The signing key comes from PRELOGIN_SECRET, so self-hosters don't need a new setting.
// Prelogin also uses that secret, as HMAC(secret, email). This label has no "@", so it can
// never be a valid email, and the two uses can't produce the same value.
const SIGNING_KEY_LABEL = "proof-of-work-signing-key:v1";

export const PROOF_OF_WORK_RESULT = {
  OK: "ok",
  /** Forged, tampered with, too easy, or the nonce doesn't solve it. */
  INVALID: "invalid",
  EXPIRED: "expired",
  /** Already used for another account. */
  USED: "used",
} as const;
export type ProofOfWorkResult = (typeof PROOF_OF_WORK_RESULT)[keyof typeof PROOF_OF_WORK_RESULT];

/**
 * Makes a new signed challenge at the configured difficulty.
 * Input: config, and the current time. Output: { challenge: "1795...", difficultyBits: 19 }.
 */
export function createChallenge(config: Config, nowMs = Date.now()): ChallengeResponse {
  const expiresAtMs = nowMs + CHALLENGE_LIFETIME_MS;
  const id = randomBytes(RANDOM_ID_BYTES).toString("base64url");
  const unsigned = `${expiresAtMs}.${config.PROOF_OF_WORK_BITS}.${id}`;
  return { challenge: `${unsigned}.${sign(config, unsigned)}`, difficultyBits: config.PROOF_OF_WORK_BITS };
}

/**
 * Checks a solved puzzle, and uses it up if it's good.
 * Input: config, database, and { challenge, nonce } from the browser. Output: a PROOF_OF_WORK_RESULT.
 * The cheap checks come first, so junk is refused without touching the database.
 */
export async function checkProofOfWork(config: Config, db: Db, proof: ProofOfWork, nowMs = Date.now()): Promise<ProofOfWorkResult> {
  const parsed = parseChallenge(config, proof.challenge);
  if (!parsed) return PROOF_OF_WORK_RESULT.INVALID;
  // A challenge made before the difficulty was raised is too easy now.
  if (parsed.difficultyBits < config.PROOF_OF_WORK_BITS) return PROOF_OF_WORK_RESULT.INVALID;
  if (parsed.expiresAtMs <= nowMs) return PROOF_OF_WORK_RESULT.EXPIRED;

  const digest = createHash("sha256").update(proofOfWorkInput(proof.challenge, proof.nonce)).digest();
  if (!hasLeadingZeroBits(digest, parsed.difficultyBits)) return PROOF_OF_WORK_RESULT.INVALID;

  // One statement, so two requests racing with the same solution can't both succeed.
  const inserted = await db
    .insert(usedChallenges)
    .values({ id: parsed.id, expiresAt: new Date(parsed.expiresAtMs) })
    .onConflictDoNothing()
    .returning({ id: usedChallenges.id });
  return inserted.length === 1 ? PROOF_OF_WORK_RESULT.OK : PROOF_OF_WORK_RESULT.USED;
}

/** Removes used challenges that have expired anyway. Output: how many were deleted. */
export async function deleteExpiredChallenges(db: Db, nowMs = Date.now()): Promise<number> {
  const deleted = await db.delete(usedChallenges).where(lt(usedChallenges.expiresAt, new Date(nowMs))).returning({ id: usedChallenges.id });
  return deleted.length;
}

/** Input: a challenge string. Output: its parts if the signature is right, otherwise null. */
function parseChallenge(config: Config, challenge: string) {
  const parts = challenge.split(".");
  if (parts.length !== 4) return null;
  const [expiresAt, bits, id, signature] = parts as [string, string, string, string];

  const expected = Buffer.from(sign(config, `${expiresAt}.${bits}.${id}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  return { expiresAtMs: Number(expiresAt), difficultyBits: Number(bits), id };
}

function sign(config: Config, text: string): string {
  const key = createHmac("sha256", config.PRELOGIN_SECRET).update(SIGNING_KEY_LABEL).digest();
  return createHmac("sha256", key).update(text).digest("base64url");
}
