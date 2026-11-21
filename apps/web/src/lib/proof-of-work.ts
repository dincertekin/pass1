// The sign-up puzzle, browser side: fetch a challenge and solve it in a worker.
// Why there's a puzzle at all: packages/shared/src/proof-of-work.ts.

import type { ChallengeResponse, ProofOfWork } from "@pass1/shared";
import { api } from "./api";
import { startWorker, WORKER_URLS } from "./workers";

export type SolveRequest = ChallengeResponse;
export type SolveResponse = { ok: true; nonce: number } | { ok: false; message: string };

/**
 * Gets a fresh sign-up puzzle from the server and solves it without freezing the page.
 * Output: { challenge, nonce }, ready to send with the registration. Takes about a second.
 */
export async function solveSignUpPuzzle(): Promise<ProofOfWork> {
  const puzzle = await api.challenge();
  const worker = startWorker(WORKER_URLS.proofOfWork);

  return new Promise<ProofOfWork>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<SolveResponse>) => {
      if (event.data.ok) resolve({ challenge: puzzle.challenge, nonce: event.data.nonce });
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => reject(new Error("The sign-up check failed to start."));
    worker.postMessage(puzzle satisfies SolveRequest);
  }).finally(() => worker.terminate());
}
