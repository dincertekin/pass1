// Refuses apps too old for this API, so they can ask the person to update (see
// packages/shared/src/app-versions.ts). Requests without the header, like the web's, pass.

import { CLIENT_HEADER, clientHeaderSchema, isOlderVersion, type AppPlatform } from "@pass1/shared";
import type { FastifyInstance } from "fastify";
import { ApiError } from "./errors.js";

/**
 * Adds the check to every request.
 * Input: the app, and the oldest supported version per platform, e.g. { ios: "1.4.0", ... }.
 */
export function registerAppVersionCheck(app: FastifyInstance, minVersions: Record<AppPlatform, string>) {
  app.addHook("onRequest", async (request) => {
    const header = request.headers[CLIENT_HEADER];
    if (header === undefined) return;

    const parsed = clientHeaderSchema.safeParse(header);
    if (!parsed.success) throw new ApiError(400, "VALIDATION_FAILED", "Invalid Pass1-Client header. Expected e.g. ios/1.4.0.");

    const { platform, version } = parsed.data;
    if (isOlderVersion(version, minVersions[platform])) {
      throw new ApiError(426, "APP_UPDATE_REQUIRED", "This version of pass1 is no longer supported. Update the app to keep using it.");
    }
  });
}
