import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyTestDatabase } from "../test-helpers.js";
import { openDatabase, type Db } from "./client.js";
import { sessions, users } from "./schema.js";

function newUser(email = "ada@example.com") {
  return {
    id: crypto.randomUUID(),
    email,
    authHash: "argon2-hash",
    kdfSalt: "AAECAwQFBgcICQoLDA0ODw==",
    kdfMemoryKiB: 65536,
    kdfIterations: 3,
    kdfParallelism: 1,
    wrappedVaultKey: { v: 1 as const, iv: "AAAAAAAAAAAAAAAA", ciphertext: "AAAA" },
  };
}

let db: Db;
beforeEach(async () => {
  db = await emptyTestDatabase();
});

describe("database", () => {
  it("applies migrations and stores a user with defaults", async () => {
    const user = newUser();
    await db.insert(users).values(user);

    const [saved] = await db.select().from(users).where(eq(users.id, user.id));
    expect(saved?.plan).toBe("free");
    expect(saved?.wrappedVaultKey).toEqual(user.wrappedVaultKey);
    expect(saved?.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a second account with the same email", async () => {
    await db.insert(users).values(newUser());
    await expect(db.insert(users).values(newUser())).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("deletes a user's sessions when the user is deleted", async () => {
    const user = newUser();
    await db.insert(users).values(user);
    await db.insert(sessions).values({ id: "token-hash", userId: user.id, expiresAt: new Date(Date.now() + 60_000) });

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});

describe("openDatabase", () => {
  it("refuses an unknown DATABASE_URL instead of guessing", async () => {
    await expect(openDatabase("mysql://localhost/pass1")).rejects.toThrow(/must start with postgres/);
  });
});
