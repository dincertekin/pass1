import { describe, expect, it } from "vitest";
import { createTestApp } from "./test-helpers.js";

describe("api", () => {
  it("responds to /health", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("behind a proxy", () => {
  it("uses the client IP from X-Forwarded-For only when told to trust one proxy", async () => {
    const { app } = await createTestApp({ TRUST_PROXY: "1" });
    app.get("/ip", async (request) => ({ ip: request.ip }));
    const res = await app.inject({ method: "GET", url: "/ip", headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(res.json().ip).toBe("203.0.113.7");
  });

  it("ignores X-Forwarded-For by default, so it can't be faked", async () => {
    const { app } = await createTestApp();
    app.get("/ip", async (request) => ({ ip: request.ip }));
    const res = await app.inject({ method: "GET", url: "/ip", headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(res.json().ip).not.toBe("203.0.113.7");
  });
});

describe("caching", () => {
  it("tells browsers and proxies never to store API responses", async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
