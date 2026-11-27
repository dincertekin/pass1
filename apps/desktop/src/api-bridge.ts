// Sends the page's API requests to the server, from the main process.
//
// The page never holds the session token (see packages/shared/src/desktop-bridge.ts). Here the
// token is added to each request, taken out of login responses before they reach the page, and
// forgotten on logout or when the server says the session is over. Requests come without an
// Origin header, so the server treats them as an app's (apps/api/src/auth/routes.ts).

import { CLIENT_HEADER, type DesktopApiRequest, type DesktopApiResponse } from "@pass1/shared";
import { app } from "electron";
import { hostname } from "node:os";
import { readToken, writeToken } from "./token-store.js";

const SESSION_STARTING_PATHS = new Set(["/auth/login", "/auth/register"]);
const MAX_DEVICE_NAME_LENGTH = 100;

/** This computer's name as people know it, e.g. "Ada's MacBook Pro" (from "Adas-MacBook-Pro.local"). */
export function deviceName(): string {
  const name = hostname().replace(/\.local$/, "").trim() || "Desktop";
  return name.slice(0, MAX_DEVICE_NAME_LENGTH);
}

/**
 * Sends one request to the server and returns the answer for the page.
 * Input: the server's address and a validated request. Output: status and body, or a network error.
 */
export async function sendApiRequest(serverUrl: string, request: DesktopApiRequest): Promise<DesktopApiResponse> {
  const pathOnly = request.path.split("?")[0]!;
  const startsSession = request.method === "POST" && SESSION_STARTING_PATHS.has(pathOnly);
  const body = startsSession ? askForAppSession(request.body) : request.body;

  let response: Response;
  try {
    response = await fetch(`${serverUrl}/api${request.path}`, { method: request.method, headers: await headersFor(body), body });
  } catch {
    return { networkError: true };
  }

  let text = await response.text();
  if (startsSession && response.ok) text = await keepTokenFromPage(text);
  // Logging out ends the session whatever the server answers; a 401 means it's already over.
  if (pathOnly === "/auth/logout" || response.status === 401) await writeToken(null);
  return { networkError: false, status: response.status, body: text };
}

async function headersFor(body: string | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = { [CLIENT_HEADER]: `desktop/${app.getVersion()}` };
  if (body !== null) headers["content-type"] = "application/json";
  const token = await readToken();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

/** Adds { appSession: { deviceName } } to a login or registration, so the server answers with a token. */
function askForAppSession(body: string | null): string | null {
  if (body === null) return null;
  try {
    return JSON.stringify({ ...JSON.parse(body), appSession: { deviceName: deviceName() } });
  } catch {
    return body;
  }
}

/** Stores the token from a login response and returns the response without it. */
async function keepTokenFromPage(text: string): Promise<string> {
  let parsed: { sessionToken?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  const { sessionToken, ...rest } = parsed;
  if (typeof sessionToken === "string") await writeToken(sessionToken);
  return JSON.stringify(rest);
}
