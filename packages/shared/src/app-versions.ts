import { z } from "zod";

// Apps say which platform and version they are with the Pass1-Client header, e.g. "ios/1.4.0".
// Old apps stay installed for years. When the API stops supporting an old app, raise its minimum
// here: the server then answers 426 APP_UPDATE_REQUIRED and the app asks the person to update,
// instead of breaking in confusing ways. The web sends no header: it's always served by the same
// server, so it's never out of date. This is about compatibility, not security; an app can lie.

export const CLIENT_HEADER = "pass1-client";

export const APP_PLATFORMS = ["ios", "android", "desktop"] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** The oldest app version the API still supports, per platform. No apps exist yet, so 0.0.0. */
export const MIN_SUPPORTED_APP_VERSION: Record<AppPlatform, string> = {
  ios: "0.0.0",
  android: "0.0.0",
  desktop: "0.0.0",
};

const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export const clientHeaderSchema = z
  .string()
  .regex(new RegExp(`^(${APP_PLATFORMS.join("|")})/\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}$`), "Expected e.g. ios/1.4.0")
  .transform((value) => {
    const [platform, version] = value.split("/") as [AppPlatform, string];
    return { platform, version };
  });

/** Input: two versions like "1.10.0" and "1.9.2". Output: true if the first is older. */
export function isOlderVersion(version: string, than: string): boolean {
  if (!VERSION_PATTERN.test(version) || !VERSION_PATTERN.test(than)) throw new RangeError(`Not a version: ${version} or ${than}`);
  const a = version.split(".").map(Number);
  const b = than.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  return false;
}
