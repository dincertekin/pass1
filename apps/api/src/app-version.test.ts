import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-helpers.js";

const MIN = { ios: "1.4.0", android: "1.2.0", desktop: "1.0.0" };

async function healthAs(client?: string) {
  const ctx = await createTestApp({}, { minAppVersions: MIN });
  return ctx.app.inject({ method: "GET", url: "/api/health", headers: client ? { "pass1-client": client } : {} });
}

describe("Apps too old for this server", () => {
  it("asks an app below the minimum to update, in words a person understands", async () => {
    const res = await healthAs("ios/1.3.9");
    expect(res.statusCode).toBe(426);
    expect(res.json().error).toEqual({
      code: "APP_UPDATE_REQUIRED",
      message: "This version of pass1 is no longer supported. Update the app to keep using it.",
    });
  });

  it("lets an app at or above its platform's minimum through", async () => {
    expect((await healthAs("ios/1.4.0")).statusCode).toBe(200);
    expect((await healthAs("android/1.10.0")).statusCode).toBe(200);
  });

  it("lets the web through, which sends no header and is never out of date", async () => {
    expect((await healthAs()).statusCode).toBe(200);
  });

  it("refuses a header it can't read", async () => {
    expect((await healthAs("ios/latest")).statusCode).toBe(400);
  });
});
