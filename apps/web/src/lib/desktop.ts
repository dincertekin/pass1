import { DESKTOP_BRIDGE_NAME, type DesktopApiRequest, type DesktopBridge } from "@pass1/shared";

// When the web app runs inside the desktop app, the preload script provides window.pass1Desktop
// (see apps/desktop/src/preload.ts). Its API requests then go through the desktop app's main
// process, which holds the session token; the page never sees it.

/** The desktop app's bridge, or null in a normal browser. */
export const desktop: DesktopBridge | null = (window as unknown as Record<string, DesktopBridge | undefined>)[DESKTOP_BRIDGE_NAME] ?? null;

/**
 * A fetch() that hands the request to the desktop app instead of the network.
 * Input: the path the API client built (e.g. "/auth/me") and its options. Output: a Response.
 */
export async function desktopFetch(bridge: DesktopBridge, input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request: DesktopApiRequest = {
    method: (init?.method ?? "GET") as DesktopApiRequest["method"],
    path: String(input),
    body: typeof init?.body === "string" ? init.body : null,
  };
  const answer = await bridge.request(request);
  // The API client turns a thrown fetch into "Can't reach pass1. Check your connection...".
  if (answer.networkError) throw new TypeError("Network error");
  return new Response(answer.body || null, { status: answer.status, headers: { "content-type": "application/json" } });
}
