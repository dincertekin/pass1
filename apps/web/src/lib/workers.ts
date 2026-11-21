// Starts pass1's Web Workers. The only place that does, because the Trusted Types policy
// (see trusted-types.ts) can be created once and lists every allowed worker file.

// "?worker&url" makes Vite build each worker and give us its final URL as a string.
import deriveKeysWorkerUrl from "./derive-keys.worker.ts?worker&url";
import proofOfWorkWorkerUrl from "./proof-of-work.worker.ts?worker&url";
import { workerUrlPolicy } from "./trusted-types";

export const WORKER_URLS = {
  deriveKeys: deriveKeysWorkerUrl,
  proofOfWork: proofOfWorkWorkerUrl,
} as const;

const policy = workerUrlPolicy(Object.values(WORKER_URLS));

/** Starts one of pass1's workers. Input: a URL from WORKER_URLS. Output: the running Worker. */
export function startWorker(url: string): Worker {
  return new Worker(policy ? policy.createScriptURL(url) : url, { type: "module" });
}
