import { deriveKeys } from "@pass1/crypto";
import type { DeriveRequest, DeriveResponse } from "./derive-keys";

// Runs Argon2id off the main thread. It takes about half a second on purpose,
// and on the main thread that would freeze the whole page.
self.onmessage = async (event: MessageEvent<DeriveRequest>) => {
  const { password, salt, params } = event.data;
  let response: DeriveResponse;
  try {
    // CryptoKey objects can be sent between threads, even non-extractable ones.
    response = { ok: true, keys: await deriveKeys(password, salt, params) };
  } catch (err) {
    response = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
