import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { sessions, users } from "../db/schema.js";
import { createTestApp } from "../test-helpers.js";

// The server can't tell real key material from random bytes, so tests use random bytes of the
// right sizes. That keeps them fast: no Argon2 in the browser-side sense.
const b64 = (bytes: number) => randomBytes(bytes).toString("base64");

function registerBody(email = "ada@example.com", authKey = b64(32)) {
  return {
    email,
    authKey,
    kdfSalt: b64(16),
    kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1 },
    wrappedVaultKey: { v: 1, iv: b64(12), ciphertext: b64(48) },
  };
}

const ORIGIN = { origin: "http://localhost:5173" };
const COOKIE = "pass1_session";

let ctx: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  ctx = await createTestApp();
});

function post(url: string, payload: unknown, headers: Record<string, string> = ORIGIN) {
  return ctx.app.inject({ method: "POST", url, payload: payload as object, headers });
}

function sessionCookie(res: { cookies: { name: string; value: string }[] }) {
  return res.cookies.find((c) => c.name === COOKIE);
}

async function registered(email = "ada@example.com") {
  const body = registerBody(email);
  const res = await post("/auth/register", body);
  expect(res.statusCode).toBe(201);
  return { body, token: sessionCookie(res)!.value };
}

describe("POST /auth/register", () => {
  it("creates the account, starts a session and returns what the browser needs to unlock", async () => {
    const body = registerBody();
    const res = await post("/auth/register", body);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      user: { email: "ada@example.com", plan: "free" },
      kdfSalt: body.kdfSalt,
      kdfParams: body.kdfParams,
      wrappedVaultKey: body.wrappedVaultKey,
    });

    const cookie = sessionCookie(res);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
  });

  it("stores an Argon2id hash of the auth key, never the auth key itself", async () => {
    const body = registerBody();
    await post("/auth/register", body);

    const user = ctx.db.select().from(users).get()!;
    expect(user.authHash).toMatch(/^\$argon2id\$/);
    expect(user.authHash).not.toContain(body.authKey);
  });

  it("only stores the hash of the session token", async () => {
    const { token } = await registered();
    const row = ctx.db.select().from(sessions).get()!;
    expect(row.id).not.toBe(token);
    expect(row.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a second account for the same email, ignoring case", async () => {
    await registered("ada@example.com");
    const res = await post("/auth/register", registerBody("ADA@Example.com"));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects KDF settings weaker than the minimum", async () => {
    const res = await post("/auth/register", { ...registerBody(), kdfParams: { memoryKiB: 1024, iterations: 1, parallelism: 1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("kdfParams") });
  });

  it("is rate limited", async () => {
    for (let i = 0; i < 5; i++) await post("/auth/register", registerBody(`user${i}@example.com`));
    const res = await post("/auth/register", registerBody("one-too-many@example.com"));
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });
});

describe("POST /auth/prelogin", () => {
  it("returns the stored salt and settings for a registered email", async () => {
    const { body } = await registered();
    const res = await post("/auth/prelogin", { email: "ada@example.com" });
    expect(res.json()).toEqual({ kdfSalt: body.kdfSalt, kdfParams: body.kdfParams });
  });

  it("returns a believable, stable fake salt for an unknown email", async () => {
    const first = (await post("/auth/prelogin", { email: "nobody@example.com" })).json();
    const again = (await post("/auth/prelogin", { email: "nobody@example.com" })).json();
    const other = (await post("/auth/prelogin", { email: "someone-else@example.com" })).json();

    expect(first).toEqual(again);
    expect(first.kdfSalt).not.toBe(other.kdfSalt);
    expect(first.kdfSalt).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(first.kdfParams).toEqual({ memoryKiB: 65536, iterations: 3, parallelism: 1 });
  });
});

describe("POST /auth/login", () => {
  it("logs in with the right auth key", async () => {
    const { body } = await registered();
    const res = await post("/auth/login", { email: body.email, authKey: body.authKey });

    expect(res.statusCode).toBe(200);
    expect(res.json().wrappedVaultKey).toEqual(body.wrappedVaultKey);
    expect(sessionCookie(res)).toBeDefined();
  });

  it("gives the same answer for a wrong key and an unknown email", async () => {
    await registered();
    const wrongKey = await post("/auth/login", { email: "ada@example.com", authKey: b64(32) });
    const unknown = await post("/auth/login", { email: "nobody@example.com", authKey: b64(32) });

    expect(wrongKey.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrongKey.json()).toEqual(unknown.json());
    expect(wrongKey.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(sessionCookie(wrongKey)).toBeUndefined();
  });

  it("is rate limited", async () => {
    for (let i = 0; i < 10; i++) await post("/auth/login", { email: "ada@example.com", authKey: b64(32) });
    const res = await post("/auth/login", { email: "ada@example.com", authKey: b64(32) });
    expect(res.statusCode).toBe(429);
  });
});

describe("GET /auth/me", () => {
  it("returns the account for a valid session", async () => {
    const { token } = await registered();
    const res = await ctx.app.inject({ method: "GET", url: "/auth/me", cookies: { [COOKIE]: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("ada@example.com");
  });

  it("rejects a request without a session", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an expired session", async () => {
    const { token } = await registered();
    ctx.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).run();
    const res = await ctx.app.inject({ method: "GET", url: "/auth/me", cookies: { [COOKIE]: token } });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("ends the session so the old cookie stops working", async () => {
    const { token } = await registered();
    const res = await ctx.app.inject({ method: "POST", url: "/auth/logout", headers: ORIGIN, cookies: { [COOKIE]: token } });

    expect(res.statusCode).toBe(204);
    expect(sessionCookie(res)?.value).toBe("");
    expect(ctx.db.select().from(sessions).all()).toHaveLength(0);

    const me = await ctx.app.inject({ method: "GET", url: "/auth/me", cookies: { [COOKIE]: token } });
    expect(me.statusCode).toBe(401);
  });
});

describe("request safety", () => {
  it("rejects writes without the web app's Origin", async () => {
    const missing = await post("/auth/register", registerBody(), {});
    const wrong = await post("/auth/register", registerBody(), { origin: "https://evil.example" });
    expect(missing.statusCode).toBe(403);
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().error.code).toBe("FORBIDDEN");
  });

  it("answers malformed JSON with the standard error shape", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { ...ORIGIN, "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("answers unknown routes with the standard error shape", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: "NOT_FOUND", message: "Not found." } });
  });

  it("sends security headers", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });
});
