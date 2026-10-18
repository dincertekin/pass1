import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "./client.js";
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

describe("database", () => {
  it("applies migrations and stores a user with defaults", () => {
    const db = createDb(":memory:");
    const user = newUser();
    db.insert(users).values(user).run();

    const saved = db.select().from(users).where(eq(users.id, user.id)).get();
    expect(saved?.plan).toBe("free");
    expect(saved?.wrappedVaultKey).toEqual(user.wrappedVaultKey);
    expect(saved?.createdAt).toBeInstanceOf(Date);
  });

  it("rejects a second account with the same email", () => {
    const db = createDb(":memory:");
    db.insert(users).values(newUser()).run();
    expect(() => db.insert(users).values(newUser()).run()).toThrow(/UNIQUE/);
  });

  it("deletes a user's sessions when the user is deleted", () => {
    const db = createDb(":memory:");
    const user = newUser();
    db.insert(users).values(user).run();
    db.insert(sessions).values({ id: "token-hash", userId: user.id, expiresAt: new Date(Date.now() + 60_000) }).run();

    db.delete(users).where(eq(users.id, user.id)).run();
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });
});
