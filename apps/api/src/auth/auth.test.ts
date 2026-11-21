import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { sessions, users } from "../db/schema.js";
import { hasLeadingZeroBits, proofOfWorkInput } from "@pass1/shared";
import { createHash } from "node:crypto";
import { b64, createTestApp, ORIGIN, registerBody, solveChallenge, SESSION_COOKIE as COOKIE } from "../test-helpers.js";
import { createChallenge } from "./proof-of-work.js";
import { deleteExpiredSessions } from "./sessions.js";

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
  const body = await registerBody(ctx.app, email);
  const res = await post("/api/auth/register", body);
  expect(res.statusCode).toBe(201);
  return { body, token: sessionCookie(res)!.value };
}

describe("POST /auth/register", () => {
  it("creates the account, starts a session and returns what the browser needs to unlock", async () => {
    const body = await registerBody(ctx.app);
    const res = await post("/api/auth/register", body);

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
    const body = await registerBody(ctx.app);
    await post("/api/auth/register", body);

    const user = (await ctx.db.select().from(users))[0]!;
    expect(user.authHash).toMatch(/^\$argon2id\$/);
    expect(user.authHash).not.toContain(body.authKey);
  });

  it("only stores the hash of the session token", async () => {
    const { token } = await registered();
    const row = (await ctx.db.select().from(sessions))[0]!;
    expect(row.id).not.toBe(token);
    expect(row.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a second account for the same email, ignoring case", async () => {
    await registered("ada@example.com");
    const res = await post("/api/auth/register", await registerBody(ctx.app, "ADA@Example.com"));
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects KDF settings weaker than the minimum", async () => {
    const res = await post("/api/auth/register", { ...(await registerBody(ctx.app)), kdfParams: { memoryKiB: 1024, iterations: 1, parallelism: 1 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: "VALIDATION_FAILED", message: expect.stringContaining("kdfParams") });
  });

  it("is rate limited", async () => {
    for (let i = 0; i < 5; i++) await post("/api/auth/register", await registerBody(ctx.app, `user${i}@example.com`));
    const res = await post("/api/auth/register", await registerBody(ctx.app, "one-too-many@example.com"));
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("RATE_LIMITED");
  });
});

describe("POST /auth/prelogin", () => {
  it("returns the stored salt and settings for a registered email", async () => {
    const { body } = await registered();
    const res = await post("/api/auth/prelogin", { email: "ada@example.com" });
    expect(res.json()).toEqual({ kdfSalt: body.kdfSalt, kdfParams: body.kdfParams });
  });

  it("returns a believable, stable fake salt for an unknown email", async () => {
    const first = (await post("/api/auth/prelogin", { email: "nobody@example.com" })).json();
    const again = (await post("/api/auth/prelogin", { email: "nobody@example.com" })).json();
    const other = (await post("/api/auth/prelogin", { email: "someone-else@example.com" })).json();

    expect(first).toEqual(again);
    expect(first.kdfSalt).not.toBe(other.kdfSalt);
    expect(first.kdfSalt).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(first.kdfParams).toEqual({ memoryKiB: 65536, iterations: 3, parallelism: 1 });
  });
});

describe("POST /auth/login", () => {
  it("logs in with the right auth key", async () => {
    const { body } = await registered();
    const res = await post("/api/auth/login", { email: body.email, authKey: body.authKey });

    expect(res.statusCode).toBe(200);
    expect(res.json().wrappedVaultKey).toEqual(body.wrappedVaultKey);
    expect(sessionCookie(res)).toBeDefined();
  });

  it("gives the same answer for a wrong key and an unknown email", async () => {
    await registered();
    const wrongKey = await post("/api/auth/login", { email: "ada@example.com", authKey: b64(32) });
    const unknown = await post("/api/auth/login", { email: "nobody@example.com", authKey: b64(32) });

    expect(wrongKey.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrongKey.json()).toEqual(unknown.json());
    expect(wrongKey.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(sessionCookie(wrongKey)).toBeUndefined();
  });

  it("is rate limited", async () => {
    for (let i = 0; i < 10; i++) await post("/api/auth/login", { email: "ada@example.com", authKey: b64(32) });
    const res = await post("/api/auth/login", { email: "ada@example.com", authKey: b64(32) });
    expect(res.statusCode).toBe(429);
  });
});

describe("GET /auth/me", () => {
  it("returns the account for a valid session", async () => {
    const { token } = await registered();
    const res = await ctx.app.inject({ method: "GET", url: "/api/auth/me", cookies: { [COOKIE]: token } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("ada@example.com");
  });

  it("rejects a request without a session", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects an expired session", async () => {
    const { token } = await registered();
    await ctx.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await ctx.app.inject({ method: "GET", url: "/api/auth/me", cookies: { [COOKIE]: token } });
    expect(res.statusCode).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("ends the session so the old cookie stops working", async () => {
    const { token } = await registered();
    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/logout", headers: ORIGIN, cookies: { [COOKIE]: token } });

    expect(res.statusCode).toBe(204);
    expect(sessionCookie(res)?.value).toBe("");
    expect(await ctx.db.select().from(sessions)).toHaveLength(0);

    const me = await ctx.app.inject({ method: "GET", url: "/api/auth/me", cookies: { [COOKIE]: token } });
    expect(me.statusCode).toBe(401);
  });
});

describe("Proving a person is signing up", () => {
  async function registerWith(proofOfWork: unknown) {
    return post("/api/auth/register", { ...(await registerBody(ctx.app)), proofOfWork });
  }

  async function accountCount() {
    return (await ctx.db.select().from(users)).length;
  }

  it("hands out a puzzle without needing an account", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/auth/challenge" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ challenge: expect.any(String), difficultyBits: 1 });
  });

  it("refuses an account without a solved puzzle", async () => {
    const res = await registerWith(undefined);
    expect(res.statusCode).toBe(400);
    expect(await accountCount()).toBe(0);
  });

  it("refuses an answer that doesn't solve the puzzle, and creates no account", async () => {
    const { challenge, difficultyBits } = createChallenge(ctx.config);
    let nonce = 0;
    while (hasLeadingZeroBits(createHash("sha256").update(proofOfWorkInput(challenge, nonce)).digest(), difficultyBits)) nonce++;

    const res = await registerWith({ challenge, nonce });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: "PROOF_OF_WORK_FAILED", message: expect.stringContaining("Reload the page") });
    expect(await accountCount()).toBe(0);
  });

  it("lets one solved puzzle create only one account", async () => {
    const proof = solveChallenge(createChallenge(ctx.config));
    const first = await post("/api/auth/register", { ...(await registerBody(ctx.app, "ada@example.com")), proofOfWork: proof });
    const second = await post("/api/auth/register", { ...(await registerBody(ctx.app, "bob@example.com")), proofOfWork: proof });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(403);
    expect(await accountCount()).toBe(1);
  });

  it("refuses a puzzle that has expired, and says to try again", async () => {
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    const res = await registerWith(solveChallenge(createChallenge(ctx.config, elevenMinutesAgo)));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toBe("The sign-up check took too long. Create the account again.");
  });

  // In both cases only the signature gives the edit away: the rest of the puzzle checks out.
  it("refuses a puzzle someone edited to make it easier", async () => {
    const { challenge } = createChallenge({ ...ctx.config, PROOF_OF_WORK_BITS: 20 });
    const [expiresAt, , id, signature] = challenge.split(".");
    const easier = solveChallenge({ challenge: `${expiresAt}.1.${id}.${signature}`, difficultyBits: 1 });
    expect((await registerWith(easier)).statusCode).toBe(403);
  });

  it("refuses a puzzle someone edited to last longer", async () => {
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    const { challenge } = createChallenge(ctx.config, elevenMinutesAgo);
    const [expiresAt, bits, id, signature] = challenge.split(".");
    const later = solveChallenge({ challenge: `${Number(expiresAt) + 3_600_000}.${bits}.${id}.${signature}`, difficultyBits: 1 });
    expect((await registerWith(later)).statusCode).toBe(403);
    expect((await registerWith(later)).json().error.message).toContain("Reload the page");
  });

  it("refuses older, easier puzzles once the difficulty is raised", async () => {
    const easy = solveChallenge(createChallenge(ctx.config));
    ctx = await createTestApp({ PROOF_OF_WORK_BITS: "4" });
    expect((await registerWith(easy)).statusCode).toBe(403);
  });
});

describe("request safety", () => {
  it("rejects writes without the web app's Origin", async () => {
    const missing = await post("/api/auth/register", await registerBody(ctx.app), {});
    const wrong = await post("/api/auth/register", await registerBody(ctx.app), { origin: "https://evil.example" });
    expect(missing.statusCode).toBe(403);
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().error.code).toBe("FORBIDDEN");
  });

  it("answers malformed JSON with the standard error shape", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
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
    const res = await ctx.app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });
});

describe("deleteExpiredSessions", () => {
  it("removes expired sessions of every user and keeps live ones", async () => {
    await registered("ada@example.com");
    await registered("eve@example.com");
    // Expire Ada's session only.
    const ada = (await ctx.db.select().from(users)).find((u) => u.email === "ada@example.com")!;
    await ctx.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, ada.id));

    expect(await deleteExpiredSessions(ctx.db)).toBe(1);
    expect(await ctx.db.select().from(sessions)).toHaveLength(1);
  });
});
