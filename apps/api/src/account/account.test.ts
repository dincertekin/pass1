import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { sessions, users, vaultItems } from "../db/schema.js";
import { b64, createTestApp, loggedInAs, ORIGIN, SESSION_COOKIE } from "../test-helpers.js";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let ada: Awaited<ReturnType<typeof loggedInAs>>;

beforeEach(async () => {
  ctx = await createTestApp();
  ada = await loggedInAs(ctx.app);
});

function login(authKey: string, userAgent = "Firefox on Linux") {
  return ctx.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "ada@example.com", authKey },
    headers: { ...ORIGIN, "user-agent": userAgent },
  });
}

function changePasswordBody(currentAuthKey: string, newAuthKey = b64(32)) {
  return {
    currentAuthKey,
    newAuthKey,
    newKdfSalt: b64(16),
    newKdfParams: { memoryKiB: 65536, iterations: 4, parallelism: 1 },
    newWrappedVaultKey: { v: 1, iv: b64(12), ciphertext: b64(48) },
  };
}

describe("POST /account/password", () => {
  it("switches to the new password: the old one stops working", async () => {
    const body = changePasswordBody(ada.authKey);
    const res = await ada.send("POST", "/api/account/password", body);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ kdfSalt: body.newKdfSalt, kdfParams: body.newKdfParams, wrappedVaultKey: body.newWrappedVaultKey });
    expect((await login(ada.authKey)).statusCode).toBe(401);
    expect((await login(body.newAuthKey)).statusCode).toBe(200);
  });

  it("ends every other session but keeps this one", async () => {
    const other = (await login(ada.authKey)).cookies.find((c) => c.name === SESSION_COOKIE)!.value;
    await ada.send("POST", "/api/account/password", changePasswordBody(ada.authKey));

    const otherMe = await ctx.app.inject({ method: "GET", url: "/api/auth/me", cookies: { [SESSION_COOKIE]: other } });
    expect(otherMe.statusCode).toBe(401);
    expect((await ada.send("GET", "/api/auth/me")).statusCode).toBe(200);
  });

  it("refuses a wrong current password and changes nothing", async () => {
    const before = (await ctx.db.select().from(users))[0]!;
    const res = await ada.send("POST", "/api/account/password", changePasswordBody(b64(32)));
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("INVALID_CREDENTIALS");
    expect((await ctx.db.select().from(users))[0]).toEqual(before);
  });

  it("refuses weak KDF settings for the new password", async () => {
    const body = { ...changePasswordBody(ada.authKey), newKdfParams: { memoryKiB: 1024, iterations: 1, parallelism: 1 } };
    expect((await ada.send("POST", "/api/account/password", body)).statusCode).toBe(400);
  });
});

describe("sessions", () => {
  it("lists this user's sessions, marking the current one", async () => {
    await login(ada.authKey, "Mozilla/5.0 (iPhone) Safari");
    const { sessions: list } = (await ada.send("GET", "/api/account/sessions")).json();

    expect(list).toHaveLength(2);
    expect(list.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.map((s: { userAgent: string }) => s.userAgent)).toContain("Mozilla/5.0 (iPhone) Safari");
  });

  it("logs out one other device", async () => {
    await login(ada.authKey);
    const { sessions: list } = (await ada.send("GET", "/api/account/sessions")).json();
    const other = list.find((s: { current: boolean }) => !s.current);

    expect((await ada.send("DELETE", `/api/account/sessions/${other.id}`)).statusCode).toBe(204);
    expect((await ada.send("GET", "/api/account/sessions")).json().sessions).toHaveLength(1);
  });

  it("logs out everywhere else", async () => {
    await login(ada.authKey);
    await login(ada.authKey);
    expect((await ada.send("POST", "/api/account/sessions/revoke-others")).statusCode).toBe(204);
    const { sessions: list } = (await ada.send("GET", "/api/account/sessions")).json();
    expect(list).toHaveLength(1);
    expect(list[0].current).toBe(true);
  });

  it("can't touch another user's sessions", async () => {
    const eve = await loggedInAs(ctx.app, "eve@example.com");
    const adaSession = (await ada.send("GET", "/api/account/sessions")).json().sessions[0];
    expect((await eve.send("DELETE", `/api/account/sessions/${adaSession.id}`)).statusCode).toBe(404);
    expect((await ada.send("GET", "/api/auth/me")).statusCode).toBe(200);
  });
});

describe("DELETE /account", () => {
  it("needs the master password", async () => {
    const res = await ada.send("DELETE", "/api/account", { authKey: b64(32) });
    expect(res.statusCode).toBe(403);
    expect(await ctx.db.select().from(users)).toHaveLength(1);
  });

  it("deletes the user, their sessions and their items", async () => {
    await ada.send("POST", "/api/vault/items", { id: crypto.randomUUID(), data: { v: 1, iv: b64(12), ciphertext: b64(272) } });
    const eve = await loggedInAs(ctx.app, "eve@example.com");

    const res = await ada.send("DELETE", "/api/account", { authKey: ada.authKey });
    expect(res.statusCode).toBe(204);

    expect(await ctx.db.select().from(users).where(eq(users.id, ada.userId))).toHaveLength(0);
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, ada.userId))).toHaveLength(0);
    expect(await ctx.db.select().from(vaultItems)).toHaveLength(0);
    // Other users are untouched.
    expect((await eve.send("GET", "/api/auth/me")).statusCode).toBe(200);
  });
});
