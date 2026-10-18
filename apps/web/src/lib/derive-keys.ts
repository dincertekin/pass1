import type { DerivedKeys, KdfParams } from "@pass1/crypto";
// "?worker&url" makes Vite build the worker and give us its final URL as a string.
import workerUrl from "./derive-keys.worker.ts?worker&url";
import { workerUrlPolicy } from "./trusted-types";

const policy = workerUrlPolicy(workerUrl);

export interface DeriveRequest {
  password: string;
  salt: string;
  params: KdfParams;
}

export type DeriveResponse = { ok: true; keys: DerivedKeys } | { ok: false; message: string };

/**
 * Same as deriveKeys() from @pass1/crypto, but in a Web Worker so the page stays responsive.
 * Each call gets a new worker, which is shut down afterwards to free Argon2's 64 MiB of memory.
 */
export function deriveKeysInWorker(password: string, salt: string, params: KdfParams): Promise<DerivedKeys> {
  const url = policy ? policy.createScriptURL(workerUrl) : workerUrl;
  const worker = new Worker(url, { type: "module" });

  return new Promise<DerivedKeys>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<DeriveResponse>) => {
      if (event.data.ok) resolve(event.data.keys);
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => reject(new Error("Key derivation failed to start."));
    worker.postMessage({ password, salt, params } satisfies DeriveRequest);
  }).finally(() => worker.terminate());
}
