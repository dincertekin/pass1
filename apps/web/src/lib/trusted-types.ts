// Trusted Types: the CSP (see apps/api/src/security-headers.ts) makes the browser refuse plain
// strings at the places XSS usually goes through: setting innerHTML, creating a Worker from a
// URL, and so on. Code has to hand over a value made by a named policy instead.
//
// pass1 has exactly one policy, and it allows exactly one thing: starting the key derivation
// worker from its own file. The CSP's `trusted-types pass1-worker` stops anyone from adding more.

// Not yet in TypeScript's DOM types.
interface TrustedTypePolicy {
  createScriptURL(url: string): string;
}
declare global {
  interface Window {
    trustedTypes?: {
      createPolicy(name: string, rules: { createScriptURL: (url: string) => string }): TrustedTypePolicy;
    };
  }
}

/** Returns a Trusted Types policy that only accepts `allowedUrl`, or null where the browser has no Trusted Types. */
export function workerUrlPolicy(allowedUrl: string): TrustedTypePolicy | null {
  return (
    window.trustedTypes?.createPolicy("pass1-worker", {
      createScriptURL(url) {
        if (url !== allowedUrl) throw new TypeError(`Refusing to start a worker from ${url}`);
        return url;
      },
    }) ?? null
  );
}
