import type { ThrottleRule } from "./auth/login-throttle.js";
import type { Config } from "./config.js";

// Every rate limit in one place. Limits are per IP address, counted in Postgres so several API
// servers share them (rate-limit-store.ts).

const ONE_MINUTE = 60 * 1000;

const STRICT = {
  prelogin: { max: 30, timeWindow: ONE_MINUTE },
  // Handing out a sign-up puzzle is cheap, but there's no reason for anyone to need many.
  challenge: { max: 30, timeWindow: ONE_MINUTE },
  // Each guess also costs the attacker a full Argon2id run in the browser.
  login: { max: 10, timeWindow: ONE_MINUTE },
  // Each one sends an email. On top of this, each address gets 3 an hour (auth/signup.ts).
  signup: { max: 5, timeWindow: 60 * ONE_MINUTE },
  // Needs a sign-up link, so it's already limited by signup; this only caps retries.
  register: { max: 10, timeWindow: 60 * ONE_MINUTE },
  // Changing the password and deleting the account both check the master password.
  passwordCheck: { max: 5, timeWindow: ONE_MINUTE },
};

export type RateLimits = typeof STRICT;

/**
 * RATE_LIMITS=relaxed allows 100× more, so end-to-end tests can register an account per
 * test from one IP. config.ts refuses to start in production with it.
 */
export function rateLimits(config: Config): RateLimits {
  if (config.RATE_LIMITS === "strict") return STRICT;
  const relaxed = { ...STRICT };
  for (const key of Object.keys(relaxed) as (keyof RateLimits)[]) {
    relaxed[key] = { ...STRICT[key], max: STRICT[key].max * 100 };
  }
  return relaxed;
}

/** Failed logins allowed per account, from any number of IPs (see auth/login-throttle.ts). */
export function loginFailureRule(config: Config): ThrottleRule {
  const rule = { maxFailures: 10, windowMs: 15 * ONE_MINUTE };
  return config.RATE_LIMITS === "strict" ? rule : { ...rule, maxFailures: rule.maxFailures * 100 };
}
