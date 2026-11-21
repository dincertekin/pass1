import { hasLeadingZeroBits, proofOfWorkInput } from "@pass1/shared";
import { createSHA256 } from "hash-wasm";
import type { SolveRequest, SolveResponse } from "./proof-of-work";

// Solves the sign-up puzzle off the main thread: about a million hashes per second, for
// half a second or so. hash-wasm is used because crypto.subtle.digest() is async per call,
// which makes it about ten times slower here.
self.onmessage = async (event: MessageEvent<SolveRequest>) => {
  const { challenge, difficultyBits } = event.data;
  let response: SolveResponse;
  try {
    const sha256 = await createSHA256();
    let nonce = 0;
    for (;;) {
      sha256.init();
      sha256.update(proofOfWorkInput(challenge, nonce));
      if (hasLeadingZeroBits(sha256.digest("binary"), difficultyBits)) break;
      nonce++;
    }
    response = { ok: true, nonce };
  } catch (err) {
    response = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
