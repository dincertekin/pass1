// What the desktop app's page may ask of Electron's main process, and nothing more.
//
// The page never talks to the server itself: it hands each API request to the main process,
// which adds the session token and sends it. The token lives only in the main process (kept by
// the OS keychain), so script injected into the page can't read it, just as it can't read the
// web's httpOnly cookie. See apps/desktop/src/api-bridge.ts.

/** The name of the object the preload script puts on `window`. */
export const DESKTOP_BRIDGE_NAME = "pass1Desktop";

/** IPC channel names, shared so the two sides can't be misspelled apart. */
export const DESKTOP_CHANNELS = {
  apiRequest: "pass1:api-request",
  lockRequested: "pass1:lock-requested",
} as const;

/** One API call, e.g. { method: "GET", path: "/vault/items?since=0", body: null }. */
export interface DesktopApiRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Relative to the server's /api, e.g. "/auth/login". */
  path: string;
  /** JSON text, or null. */
  body: string | null;
}

/** The server's answer, or `networkError` when it couldn't be reached at all. */
export type DesktopApiResponse = { networkError: false; status: number; body: string } | { networkError: true };

/** What `window.pass1Desktop` offers the page. */
export interface DesktopBridge {
  request(request: DesktopApiRequest): Promise<DesktopApiResponse>;
  /** Calls `onLock` when the computer sleeps or its screen locks. Output: a function that stops listening. */
  onLockRequested(onLock: () => void): () => void;
}
