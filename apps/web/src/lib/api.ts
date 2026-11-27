import { createApiClient, type ApiClient } from "@pass1/core";
import { desktop, desktopFetch } from "./desktop";

// The web app's API client. The client itself is in @pass1/core, shared with the phone app.
// In the desktop app, requests go through its main process (lib/desktop.ts) instead.

function createClient(): ApiClient {
  const bridge = desktop;
  if (bridge) return createApiClient({ baseUrl: "", fetch: (input, init) => desktopFetch(bridge, input, init) });
  // In development Vite forwards /api to the API server (see vite.config.ts).
  return createApiClient({ baseUrl: "/api" });
}

export const api = createClient();

export { ApiRequestError } from "@pass1/core";
