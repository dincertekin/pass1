// Checks every API request the page hands to the main process (see api-bridge.ts). The page is
// trusted no more than a website would be: if script were ever injected into it, this is what
// stands between that script and the server.

import type { DesktopApiRequest } from "@pass1/shared";

const METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
// Paths are the API's own: letters, digits and the few characters its URLs use.
const PATH_PATTERN = /^\/[A-Za-z0-9\-_/?=&.%]*$/;
// Any origin works for checking where a path ends up; this one can never resolve.
const PROBE_ORIGIN = "https://server.invalid";
// The API refuses bodies over 256 KiB; anything bigger from the page is a bug or an attack.
const MAX_BODY_CHARACTERS = 512 * 1024;

/**
 * Input: anything the page sent. Output: a request that's safe to forward, or null.
 * The page is trusted no more than a website would be.
 */
export function validateRequest(input: unknown): DesktopApiRequest | null {
  if (typeof input !== "object" || input === null) return null;
  const { method, path, body } = input as Record<string, unknown>;
  if (typeof method !== "string" || !METHODS.has(method)) return null;
  if (typeof path !== "string" || !PATH_PATTERN.test(path) || !staysInsideApi(path)) return null;
  if (body !== null && (typeof body !== "string" || body.length > MAX_BODY_CHARACTERS)) return null;
  return { method: method as DesktopApiRequest["method"], path, body };
}

/**
 * True when the path, joined to the server's /api the way api-bridge.ts does, still points inside
 * /api on the same server. Checking the joined URL catches every spelling of "..", including
 * "%2e%2e", which URLs treat exactly like "..".
 */
function staysInsideApi(path: string): boolean {
  try {
    const url = new URL(`${PROBE_ORIGIN}/api${path}`);
    return url.origin === PROBE_ORIGIN && url.pathname.startsWith("/api/") && !url.pathname.includes("//");
  } catch {
    return false;
  }
}
