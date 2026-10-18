import { DEFAULT_KDF_PARAMS, createVaultKey, deriveKeys, encryptItem, generateSalt, newItemId } from "@pass1/crypto";
import { describe, expect, it } from "vitest";
import {
  authKeySchema,
  emailSchema,
  encryptedBlobSchema,
  kdfParamsSchema,
  kdfSaltSchema,
  MAX_ITEM_CIPHERTEXT_BYTES,
} from "./index";

// These tests check that what @pass1/crypto produces is exactly what the API will accept.
// If one fails, the browser and the server have drifted apart.
describe("contract with @pass1/crypto", () => {
  const FAST = { memoryKiB: 1024, iterations: 1, parallelism: 1 };

  it("accepts the default KDF params", () => {
    expect(kdfParamsSchema.safeParse(DEFAULT_KDF_PARAMS).success).toBe(true);
  });

  it("accepts a generated salt, auth key, wrapped vault key and item", async () => {
    const salt = generateSalt();
    const { authKey, encryptionKey } = await deriveKeys("hunter2", salt, FAST);
    const { vaultKey, wrappedVaultKey } = await createVaultKey(encryptionKey);
    const item = await encryptItem(vaultKey, newItemId(), { name: "GitHub", password: "x" });

    expect(kdfSaltSchema.safeParse(salt).success).toBe(true);
    expect(authKeySchema.safeParse(authKey).success).toBe(true);
    expect(encryptedBlobSchema.safeParse(wrappedVaultKey).success).toBe(true);
    expect(encryptedBlobSchema.safeParse(item).success).toBe(true);
  });
});

describe("kdfParamsSchema", () => {
  it("rejects settings weaker than the default", () => {
    expect(kdfParamsSchema.safeParse({ ...DEFAULT_KDF_PARAMS, memoryKiB: 1024 }).success).toBe(false);
    expect(kdfParamsSchema.safeParse({ ...DEFAULT_KDF_PARAMS, iterations: 1 }).success).toBe(false);
  });

  it("rejects settings that would freeze the browser", () => {
    expect(kdfParamsSchema.safeParse({ ...DEFAULT_KDF_PARAMS, memoryKiB: 8 * 1024 * 1024 }).success).toBe(false);
  });
});

describe("encryptedBlobSchema", () => {
  const valid = { v: 1, iv: "AAAAAAAAAAAAAAAA", ciphertext: "AAAA" };

  it("rejects an unknown version", () => {
    expect(encryptedBlobSchema.safeParse({ ...valid, v: 2 }).success).toBe(false);
  });

  it("rejects an IV of the wrong length", () => {
    expect(encryptedBlobSchema.safeParse({ ...valid, iv: "AAAA" }).success).toBe(false);
  });

  it("rejects oversized ciphertext", () => {
    const tooBig = "A".repeat(Math.ceil(MAX_ITEM_CIPHERTEXT_BYTES / 3) * 4 + 4);
    expect(encryptedBlobSchema.safeParse({ ...valid, ciphertext: tooBig }).success).toBe(false);
  });

  it("rejects extra fields silently by stripping them", () => {
    const parsed = encryptedBlobSchema.parse({ ...valid, plaintext: "oops" });
    expect(parsed).not.toHaveProperty("plaintext");
  });
});

describe("emailSchema", () => {
  it("normalizes case and whitespace so one person can't register twice", () => {
    expect(emailSchema.parse("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("rejects invalid addresses", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});
