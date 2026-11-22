// Limits failed logins per account, on top of the per-IP limits in rate-limits.ts.
//
// Per-IP limits alone don't stop guessing spread over many machines (a botnet): each IP stays
// under its limit while the account gets thousands of guesses. This counts failures per email,
// whichever IP they come from.
//
// While an account is blocked, every login for it is refused, the right password included.
// Otherwise the guessing would go on and succeed the moment it hit the password. The cost: an
// attacker can stop someone logging in on a new device for a while. Devices that are already
// logged in, and unlocking (which never contacts the server), keep working.
//
// A puzzle (like the sign-up one in proof-of-work.ts) must not replace this block. A puzzle only
// costs computing time, so someone with many machines could keep guessing for as long as they
// like. The block caps guesses at a fixed number, however much computing power is behind them.
//
// Unknown emails are counted the same way, so the block can't reveal which accounts exist.
// Counts live in Postgres, so every API server sees the same ones, and emails are stored only
// as keyed hashes (privacy-hash.ts).

import { eq, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { loginFailures } from "../db/schema.js";
import type { PrivacyHash } from "../privacy-hash.js";

export interface ThrottleRule {
  maxFailures: number;
  windowMs: number;
}

export class LoginThrottle {
  constructor(
    private db: Db,
    private rule: ThrottleRule,
    private hash: PrivacyHash,
  ) {}

  /** Input: an email and the time. Output: milliseconds until it may try again, or 0 when it isn't blocked. */
  async retryAfter(email: string, nowMs = Date.now()): Promise<number> {
    const [row] = await this.db.select().from(loginFailures).where(eq(loginFailures.emailHash, this.hash("email", email)));
    if (!row || nowMs - row.since.getTime() >= this.rule.windowMs) return 0;
    return row.count >= this.rule.maxFailures ? row.since.getTime() + this.rule.windowMs - nowMs : 0;
  }

  /**
   * Counts one failed login. One statement, so two servers counting at once can't lose a failure:
   * a window that has ended starts again at 1, otherwise the count goes up by one.
   */
  async recordFailure(email: string, nowMs = Date.now()): Promise<void> {
    const now = new Date(nowMs);
    const windowStart = new Date(nowMs - this.rule.windowMs);
    const isStale = sql`${loginFailures.since} <= ${windowStart.toISOString()}::timestamptz`;
    await this.db
      .insert(loginFailures)
      .values({ emailHash: this.hash("email", email), count: 1, since: now })
      .onConflictDoUpdate({
        target: loginFailures.emailHash,
        set: {
          count: sql`case when ${isStale} then 1 else ${loginFailures.count} + 1 end`,
          since: sql`case when ${isStale} then ${now.toISOString()}::timestamptz else ${loginFailures.since} end`,
        },
      });
  }

  async recordSuccess(email: string): Promise<void> {
    await this.db.delete(loginFailures).where(eq(loginFailures.emailHash, this.hash("email", email)));
  }
}

/** Deletes counts whose window has ended. server.ts runs this once an hour. Output: how many. */
export async function deleteStaleLoginFailures(db: Db, rule: ThrottleRule, nowMs = Date.now()): Promise<number> {
  const deleted = await db
    .delete(loginFailures)
    .where(lt(loginFailures.since, new Date(nowMs - rule.windowMs)))
    .returning({ emailHash: loginFailures.emailHash });
  return deleted.length;
}
