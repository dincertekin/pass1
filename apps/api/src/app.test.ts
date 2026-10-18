import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-helpers.js";

describe("api", () => {
  it("responds to /health", async () => {
    const { app } = createTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
