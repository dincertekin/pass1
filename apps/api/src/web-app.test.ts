import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "./test-helpers.js";

// A stand-in for apps/web/dist.
let distDir: string;
beforeAll(() => {
  distDir = mkdtempSync(join(tmpdir(), "pass1-dist-"));
  mkdirSync(join(distDir, "assets"));
  writeFileSync(
    join(distDir, "index.html"),
    '<!doctype html><title>pass1</title><meta name="csp-style-nonce" content="__CSP_NONCE__" />',
  );
  writeFileSync(join(distDir, "assets", "index-abc123.js"), "console.log('app')");
});

async function appServingWeb() {
  return (await createTestApp({ WEB_DIST_DIR: distDir })).app;
}

describe("serving the web app", () => {
  it("serves index.html for app URLs, so reloading /vault works", async () => {
    const app = await appServingWeb();
    for (const url of ["/", "/vault", "/settings"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("<title>pass1</title>");
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("caches hashed assets forever", async () => {
    const res = await (await appServingWeb()).inject({ method: "GET", url: "/assets/index-abc123.js" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("still answers unknown API URLs with JSON, never the app", async () => {
    const res = await (await appServingWeb()).inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});

describe("security headers", () => {
  it("sends a strict Content-Security-Policy with the page", async () => {
    const res = await (await appServingWeb()).inject({ method: "GET", url: "/" });
    const csp = String(res.headers["content-security-policy"]);

    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toMatch(/style-src 'self' 'nonce-[A-Za-z0-9+/=]{24}'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
    // Nothing that would allow inline code or other origins.
    expect(csp).not.toMatch(/'unsafe-inline'|'unsafe-eval'|https:|\*/);
  });

  it("puts a fresh nonce in both the header and the page on every load", async () => {
    const app = await appServingWeb();
    const nonces = [];
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: "GET", url: "/vault" });
      const inHeader = String(res.headers["content-security-policy"]).match(/'nonce-([^']+)'/)![1];
      const inPage = res.body.match(/name="csp-style-nonce" content="([^"]+)"/)![1];
      expect(inPage).toBe(inHeader);
      nonces.push(inPage);
    }
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  it("sends the other protective headers", async () => {
    const res = await (await appServingWeb()).inject({ method: "GET", url: "/" });
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["strict-transport-security"]).toBe("max-age=31536000; includeSubDomains");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
  });
});
