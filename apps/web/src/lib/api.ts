import { createApiClient } from "@pass1/core";

// The web app's API client. The client itself is in @pass1/core, shared with the phone app.

/** In development Vite forwards /api to the API server (see vite.config.ts). */
export const api = createApiClient({ baseUrl: "/api" });

export { ApiRequestError } from "@pass1/core";
