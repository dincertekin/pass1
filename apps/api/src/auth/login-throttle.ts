// Limits failed logins per account, on top of the per-IP limits in rate-limits.ts.
//
// Per-IP limits alone don't stop guessing spread over many machines (a botnet): each IP stays
// under its limit while the account gets thousands of guesses. This counts failures per email,
// whichever IP they come from.
//
// While an account is blocked, every login for it is refused, the right password included.
// Otherwise the guessing would go on and succeed the moment it hit the password. The cost: an
// attacker can stop someone logging in on a new device for a while. Devices that are already
// logged in, and unlocking (which never contacts the server), keep working. Phase 8's CAPTCHA
// can replace the hard block later.
//
// Unknown emails are counted the same way, so the block can't reveal which accounts exist.
// Counts live in memory: fine for one server; several servers would need a shared store.

export interface ThrottleRule {
  maxFailures: number;
  windowMs: number;
}

/** Most emails tracked at once, so someone spraying random emails can't exhaust memory. */
const MAX_TRACKED = 100_000;

export class LoginThrottle {
  private failures = new Map<string, { count: number; since: number }>();

  constructor(private rule: ThrottleRule) {}

  /** Milliseconds until `email` may try again, or 0 when it isn't blocked. */
  retryAfter(email: string, now = Date.now()): number {
    const entry = this.failures.get(email);
    if (!entry || now - entry.since >= this.rule.windowMs) return 0;
    return entry.count >= this.rule.maxFailures ? entry.since + this.rule.windowMs - now : 0;
  }

  recordFailure(email: string, now = Date.now()) {
    const entry = this.failures.get(email);
    if (!entry || now - entry.since >= this.rule.windowMs) {
      this.makeRoom(now);
      this.failures.set(email, { count: 1, since: now });
    } else {
      entry.count++;
    }
  }

  recordSuccess(email: string) {
    this.failures.delete(email);
  }

  /** Drops expired entries; if still full, drops the oldest (a Map keeps insertion order). */
  private makeRoom(now: number) {
    if (this.failures.size < MAX_TRACKED) return;
    for (const [email, entry] of this.failures) {
      if (now - entry.since >= this.rule.windowMs) this.failures.delete(email);
    }
    while (this.failures.size >= MAX_TRACKED) {
      this.failures.delete(this.failures.keys().next().value!);
    }
  }
}
