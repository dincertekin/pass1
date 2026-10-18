import { hash, verify } from "@node-rs/argon2";

// The browser already ran Argon2id on the master password, so the auth key it sends is a
// strong random-looking value. Hashing it again here means a stolen database can't be
// used to log in, and offline guessing pays the Argon2 cost twice.
//
// These are OWASP's minimum Argon2id settings: the expensive work happens in the browser,
// and the server has to stay fast enough to handle many logins at once.
const OPTIONS = {
  // Algorithm.Argon2id. The library exports it as a const enum, which our TS settings can't import.
  algorithm: 2,
  memoryCost: 19 * 1024, // KiB
  timeCost: 2,
  parallelism: 1,
};

export function hashAuthKey(authKey: string): Promise<string> {
  return hash(authKey, OPTIONS);
}

export function verifyAuthKey(storedHash: string, authKey: string): Promise<boolean> {
  return verify(storedHash, authKey);
}

// Login for an unknown email still runs one verify against this hash, so it takes as long
// as a real wrong password. Otherwise the response time would reveal which emails exist.
const dummyHash = hashAuthKey("pass1-dummy-auth-key");

export async function verifyAgainstDummy(authKey: string): Promise<void> {
  await verify(await dummyHash, authKey);
}
