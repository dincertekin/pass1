import type { DerivedKeys, KdfParams } from "@pass1/crypto";

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
  const worker = new Worker(new URL("./derive-keys.worker.ts", import.meta.url), { type: "module" });

  return new Promise<DerivedKeys>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<DeriveResponse>) => {
      if (event.data.ok) resolve(event.data.keys);
      else reject(new Error(event.data.message));
    };
    worker.onerror = () => reject(new Error("Key derivation failed to start."));
    worker.postMessage({ password, salt, params } satisfies DeriveRequest);
  }).finally(() => worker.terminate());
}
