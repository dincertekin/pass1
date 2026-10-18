import { createVaultKey, deriveKeys, encryptItem, generateSalt } from "@pass1/crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { users, vaultItems } from "../db/schema.js";
import { b64, createTestApp, loggedInAs } from "../test-helpers.js";

const blob = (bytes = 272) => ({ v: 1 as const, iv: b64(12), ciphertext: b64(bytes) });

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let ada: Awaited<ReturnType<typeof loggedInAs>>;

beforeEach(async () => {
  ctx = await createTestApp();
  ada = await loggedInAs(ctx.app);
});

async function createItem(as = ada, id: string = crypto.randomUUID()) {
  const res = await as.send("POST", "/api/vault/items", { id, data: blob() });
  expect(res.statusCode).toBe(201);
  return res.json();
}

/** Inserts items straight into the database, for limit tests that need hundreds of them. */
function fillVault(userId: string, count: number, size = 272) {
  const now = new Date();
  const rows = Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    userId,
    data: blob(),
    size,
    createdAt: now,
    updatedAt: now,
  }));
  ctx.db.insert(vaultItems).values(rows).run();
}

describe("vault items", () => {
  it("requires a session", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/vault/items" });
    expect(res.statusCode).toBe(401);
  });

  it("creates and lists items", async () => {
    const id = crypto.randomUUID();
    const data = blob();
    const created = await ada.send("POST", "/api/vault/items", { id, data });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ id, revision: 1, data, deletedAt: null });

    const list = await ada.send("GET", "/api/vault/items");
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].id).toBe(id);
  });

  it("rejects an ID that isn't a UUID or is already taken", async () => {
    const bad = await ada.send("POST", "/api/vault/items", { id: "1", data: blob() });
    expect(bad.statusCode).toBe(400);

    const { id } = await createItem();
    const dup = await ada.send("POST", "/api/vault/items", { id, data: blob() });
    expect(dup.statusCode).toBe(409);
  });

  it("updates an item and bumps its revision", async () => {
    const item = await createItem();
    const data = blob();
    const res = await ada.send("PUT", `/api/vault/items/${item.id}`, { data, revision: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ revision: 2, data });
  });

  it("rejects an edit based on an old revision instead of overwriting newer data", async () => {
    const item = await createItem();
    await ada.send("PUT", `/api/vault/items/${item.id}`, { data: blob(), revision: 1 }); // another tab saves first
    const stale = await ada.send("PUT", `/api/vault/items/${item.id}`, { data: blob(), revision: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("CONFLICT");
  });

  it("moves items to the trash and back", async () => {
    const item = await createItem();
    const trashed = await ada.send("POST", `/api/vault/items/${item.id}/trash`);
    expect(trashed.json().deletedAt).toEqual(expect.any(Number));

    const restored = await ada.send("POST", `/api/vault/items/${item.id}/restore`);
    expect(restored.json()).toMatchObject({ deletedAt: null, revision: 3 });
  });

  it("deletes items permanently", async () => {
    const item = await createItem();
    expect((await ada.send("DELETE", `/api/vault/items/${item.id}`)).statusCode).toBe(204);
    expect((await ada.send("GET", "/api/vault/items")).json().items).toEqual([]);
  });
});

describe("isolation between users", () => {
  it("hides one user's items from another, as if they didn't exist", async () => {
    const item = await createItem(ada);
    const eve = await loggedInAs(ctx.app, "eve@example.com");

    expect((await eve.send("GET", "/api/vault/items")).json().items).toEqual([]);
    expect((await eve.send("PUT", `/api/vault/items/${item.id}`, { data: blob(), revision: 1 })).statusCode).toBe(404);
    expect((await eve.send("POST", `/api/vault/items/${item.id}/trash`)).statusCode).toBe(404);
    expect((await eve.send("DELETE", `/api/vault/items/${item.id}`)).statusCode).toBe(404);

    // Ada's item is untouched.
    expect((await ada.send("GET", "/api/vault/items")).json().items[0]).toMatchObject({ revision: 1, deletedAt: null });
  });
});

describe("plan limits", () => {
  it("rejects item 501 on the free plan", async () => {
    fillVault(ada.userId, 500);
    const res = await ada.send("POST", "/api/vault/items", { id: crypto.randomUUID(), data: blob() });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: "PLAN_LIMIT_REACHED", message: "Your plan holds up to 500 items." });
  });

  it("counts items in the trash, because they're still stored", async () => {
    fillVault(ada.userId, 499);
    const item = await createItem();
    await ada.send("POST", `/api/vault/items/${item.id}/trash`);
    const res = await ada.send("POST", "/api/vault/items", { id: crypto.randomUUID(), data: blob() });
    expect(res.statusCode).toBe(403);
  });

  it("allows more items on pass1 Unlimited", async () => {
    ctx.db.update(users).set({ plan: "unlimited" }).where(eq(users.id, ada.userId)).run();
    fillVault(ada.userId, 500);
    await createItem();
  });

  it("rejects growth past the storage limit but still allows shrinking", async () => {
    const item = await createItem();
    fillVault(ada.userId, 1, 10 * 1024 * 1024); // the account is now over 10 MB

    const grow = await ada.send("PUT", `/api/vault/items/${item.id}`, { data: blob(1024), revision: 1 });
    expect(grow.statusCode).toBe(403);
    expect(grow.json().error.message).toBe("Your plan holds up to 10 MB.");

    const shrink = await ada.send("PUT", `/api/vault/items/${item.id}`, { data: blob(16), revision: 1 });
    expect(shrink.statusCode).toBe(200);
  });
});

describe("what the server stores", () => {
  it("never contains plaintext", async () => {
    const { encryptionKey } = await deriveKeys("hunter2", generateSalt(), { memoryKiB: 1024, iterations: 1, parallelism: 1 });
    const { vaultKey } = await createVaultKey(encryptionKey);
    const id = crypto.randomUUID();
    const data = await encryptItem(vaultKey, id, {
      name: "Secret Bank",
      url: "https://secret-bank.example",
      username: "ada-secret-user",
      password: "hunter2-secret-password",
    });
    await ada.send("POST", "/api/vault/items", { id, data });

    const stored = JSON.stringify(ctx.db.select().from(vaultItems).all());
    for (const plaintext of ["Secret Bank", "secret-bank", "ada-secret-user", "hunter2-secret-password"]) {
      expect(stored).not.toContain(plaintext);
    }
  });
});
