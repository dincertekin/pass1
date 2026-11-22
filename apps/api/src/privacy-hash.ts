// Keyed hashes for values the server must count but shouldn't keep: IP addresses (rate limits)
// and emails typed into the login form (the login block). The README promises no stored IP
// addresses, and these tables end up in backups. Without the key, even the small space of all
// IPv4 addresses can't be searched to undo a hash.

import { createHmac } from "node:crypto";
import type { Config } from "./config.js";

// The key comes from PRELOGIN_SECRET, like the sign-up puzzle's (auth/proof-of-work.ts). This
// label has no "@", so it can never equal an email that prelogin hashes with the same secret.
const KEY_LABEL = "privacy-hash-key:v1";

export type PrivacyHash = (purpose: "ip" | "email", value: string) => string;

/**
 * Makes the hashing function. Input: config. Output: (purpose, value) => 64 hex characters.
 * The purpose is part of the hash, so an email and an IP never collide.
 */
export function createPrivacyHash(config: Config): PrivacyHash {
  const key = createHmac("sha256", config.PRELOGIN_SECRET).update(KEY_LABEL).digest();
  return (purpose, value) => createHmac("sha256", key).update(`${purpose}:${value}`).digest("hex");
}
