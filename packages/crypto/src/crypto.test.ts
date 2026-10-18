import { describe, expect, it } from "vitest";
import {
  DEFAULT_KDF_PARAMS,
  DecryptionError,
  EXPORT_FORMAT,
  FORMAT_VERSION,
  PADDING_BLOCK,
  UnsupportedFormatError,
  createExport,
  createVaultKey,
  decryptItem,
  deriveKeys,
  encryptItem,
  generateSalt,
  newItemId,
  openExport,
  rewrapVaultKey,
  unwrapVaultKey,
  type EncryptedBlob,
  type KdfParams,
  type VaultItem,
} from "./index";

// Low-cost params keep the suite fast. Production code uses DEFAULT_KDF_PARAMS.
const FAST: KdfParams = { memoryKiB: 1024, iterations: 1, parallelism: 1 };

const ID = "00000000-0000-4000-8000-000000000001";

const item: VaultItem = {
  name: "GitHub",
  url: "https://github.com",
  username: "dincer",
  password: "correct horse battery staple ✓ şğüöç",
  notes: "unicode should survive the round trip",
};

describe("deriveKeys", () => {
  it("is deterministic for the same password and salt", async () => {
    const salt = generateSalt();
    const a = await deriveKeys("hunter2", salt, FAST);
    const b = await deriveKeys("hunter2", salt, FAST);
    expect(a.authKey).toBe(b.authKey);
  });

  it("produces different keys for a different password or salt", async () => {
    const salt = generateSalt();
    const base = await deriveKeys("hunter2", salt, FAST);
    expect((await deriveKeys("hunter3", salt, FAST)).authKey).not.toBe(base.authKey);
    expect((await deriveKeys("hunter2", generateSalt(), FAST)).authKey).not.toBe(base.authKey);
  });

  // Pins the full derivation pipeline. If this changes, every existing user is locked out,
  // so it must only ever change together with a versioned migration.
  it("matches the pinned regression vector", async () => {
    const salt = "AAECAwQFBgcICQoLDA0ODw=="; // bytes 0..15
    const { authKey } = await deriveKeys("pass1-test-vector", salt, FAST);
    expect(authKey).toMatchInlineSnapshot(`"vtuEjJqJe5qj5sa4lZTmkevaEGFfy3YmI/0u0VMP6gA="`);
  });

  it("works with production parameters", async () => {
    const { authKey } = await deriveKeys("hunter2", generateSalt(), DEFAULT_KDF_PARAMS);
    expect(authKey).toHaveLength(44); // 32 bytes, base64
  });
});

describe("vault key", () => {
  it("unwraps with the right password and fails with the wrong one", async () => {
    const salt = generateSalt();
    const { encryptionKey } = await deriveKeys("hunter2", salt, FAST);
    const { vaultKey, wrappedVaultKey } = await createVaultKey(encryptionKey);
    const blob = await encryptItem(vaultKey, ID, item);

    const unwrapped = await unwrapVaultKey(encryptionKey, wrappedVaultKey);
    expect(await decryptItem(unwrapped, ID, blob)).toEqual(item);

    const wrong = await deriveKeys("hunter3", salt, FAST);
    await expect(unwrapVaultKey(wrong.encryptionKey, wrappedVaultKey)).rejects.toThrow(DecryptionError);
  });

  it("is non-extractable", async () => {
    const { encryptionKey } = await deriveKeys("hunter2", generateSalt(), FAST);
    const { vaultKey } = await createVaultKey(encryptionKey);
    expect(vaultKey.extractable).toBe(false);
  });
});

describe("item encryption", () => {
  async function newVaultKey() {
    const { encryptionKey } = await deriveKeys("hunter2", generateSalt(), FAST);
    return (await createVaultKey(encryptionKey)).vaultKey;
  }

  it("round-trips an item", async () => {
    const key = await newVaultKey();
    expect(await decryptItem(key, ID, await encryptItem(key, ID, item))).toEqual(item);
  });

  it("tags every blob with the format version", async () => {
    const blob = await encryptItem(await newVaultKey(), ID, item);
    expect(blob.v).toBe(FORMAT_VERSION);
  });

  it("uses a fresh IV every time", async () => {
    const key = await newVaultKey();
    const a = await encryptItem(key, ID, item);
    const b = await encryptItem(key, ID, item);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("does not leak plaintext into the ciphertext", async () => {
    const blob = await encryptItem(await newVaultKey(), ID, item);
    expect(JSON.stringify(blob)).not.toContain("GitHub");
  });

  it("rejects tampered ciphertext", async () => {
    const key = await newVaultKey();
    const blob = await encryptItem(key, ID, item);
    const bytes = Uint8Array.from(atob(blob.ciphertext), (c) => c.charCodeAt(0));
    bytes[0]! ^= 1;
    const tampered = { ...blob, ciphertext: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptItem(key, ID, tampered)).rejects.toThrow(DecryptionError);
  });

  it("rejects a different vault key", async () => {
    const blob = await encryptItem(await newVaultKey(), ID, item);
    await expect(decryptItem(await newVaultKey(), ID, blob)).rejects.toThrow(DecryptionError);
  });

  // A malicious server swapping two items' ciphertexts must not go unnoticed.
  it("rejects a ciphertext moved to another item ID", async () => {
    const key = await newVaultKey();
    const blob = await encryptItem(key, ID, item);
    await expect(decryptItem(key, newItemId(), blob)).rejects.toThrow(DecryptionError);
  });

  it("rejects an unknown format version", async () => {
    const key = await newVaultKey();
    const blob = await encryptItem(key, ID, item);
    const future = { ...blob, v: 2 } as unknown as EncryptedBlob;
    await expect(decryptItem(key, ID, future)).rejects.toThrow(UnsupportedFormatError);
  });

  it("hides password length behind padding", async () => {
    const key = await newVaultKey();
    const short = await encryptItem(key, ID, { name: "A", password: "abc" });
    const long = await encryptItem(key, ID, { name: "A much longer site name", password: "a".repeat(100) });
    const size = (b: EncryptedBlob) => atob(b.ciphertext).length;
    const GCM_TAG = 16;
    expect(size(short)).toBe(size(long));
    expect((size(short) - GCM_TAG) % PADDING_BLOCK).toBe(0);
  });

  it("pads large items to the next block, not beyond", async () => {
    const key = await newVaultKey();
    const blob = await encryptItem(key, ID, { name: "Notes", password: "x", notes: "n".repeat(1000) });
    expect(atob(blob.ciphertext).length).toBe(5 * PADDING_BLOCK + 16);
  });
});

// Pins format v1 end to end. Data like this already lives on the server, so if this test
// fails, existing vaults can no longer be opened. Never update these values; add a new version.
describe("format v1 regression vector", () => {
  const wrappedVaultKey: EncryptedBlob = {
    v: 1,
    iv: "19f6En9iVVFOOAEy",
    ciphertext: "beXCY3eWdlG/h0/FH8Rv5dm3aAaXA77hTKMLt+5PbXUwXdyy6RqNoPM7d2jBZIDI",
  };
  const blob: EncryptedBlob = {
    v: 1,
    iv: "oVMSFOiMD6xX53EQ",
    ciphertext:
      "9h5/6UwklGL8+9ybZ+JpanCIKA9thgxKrxt9tK23bYYCrc7LQJpb95eFAmSEztoomamr8m1GK2kCnPcyvN5hiVB6GFiFgj8Fe6s2ewAjdXVjCedmInyYFT7mmP+djG/KJmGPqa/s/zZYNhdYJUDFEaWtLniciD9D4HuUhL52OtcC3K8Pevp88nNRqBAZLt8tpCEawn9wjqf/mZHcwQ8xSFXdLkQ0dP/rdoqkRc3qW2BPQzQzer3+WxAqRNT+L3shpC1ffTojCxZnbGdqFHHvgVwTLKEZCCo+5J5As2VYsiirNtF3lp1dO/A932XONtwhq8QEdD14FXpW7WO2scdcLjvFHdFEVdnawDn/n/OlnHo=",
  };

  it("still decrypts", async () => {
    const { encryptionKey } = await deriveKeys("pass1-test-vector", "AAECAwQFBgcICQoLDA0ODw==", FAST);
    const vaultKey = await unwrapVaultKey(encryptionKey, wrappedVaultKey);
    expect(await decryptItem(vaultKey, ID, blob)).toEqual({ name: "Pinned", password: "v1-format" });
  });
});

describe("changing the master password", () => {
  it("re-wraps the vault key so items still decrypt with the new password only", async () => {
    const oldKeys = await deriveKeys("old password", generateSalt(), FAST);
    const { vaultKey, wrappedVaultKey } = await createVaultKey(oldKeys.encryptionKey);
    const blob = await encryptItem(vaultKey, ID, item);

    const newKeys = await deriveKeys("new password", generateSalt(), FAST);
    const rewrapped = await rewrapVaultKey(oldKeys.encryptionKey, wrappedVaultKey, newKeys.encryptionKey);

    const unwrapped = await unwrapVaultKey(newKeys.encryptionKey, rewrapped);
    expect(await decryptItem(unwrapped, ID, blob)).toEqual(item);
    await expect(unwrapVaultKey(oldKeys.encryptionKey, rewrapped)).rejects.toThrow(DecryptionError);
  });

  it("refuses to re-wrap with the wrong current key", async () => {
    const real = await deriveKeys("real", generateSalt(), FAST);
    const wrong = await deriveKeys("wrong", generateSalt(), FAST);
    const { wrappedVaultKey } = await createVaultKey(real.encryptionKey);
    await expect(rewrapVaultKey(wrong.encryptionKey, wrappedVaultKey, wrong.encryptionKey)).rejects.toThrow(DecryptionError);
  });
});

describe("export files", () => {
  const items: VaultItem[] = [item, { name: "Bank", password: "Xp4$wN7!", favorite: true }];

  it("round-trips with the export password", async () => {
    const file = await createExport(items, "export password");
    expect(file.format).toBe(EXPORT_FORMAT);
    expect(JSON.stringify(file)).not.toContain("GitHub");
    expect(await openExport(file, "export password")).toEqual(items);
  });

  it("rejects a wrong password or a modified file", async () => {
    const file = await createExport(items, "export password");
    await expect(openExport(file, "wrong")).rejects.toThrow(DecryptionError);
    const tampered = { ...file, data: { ...file.data, iv: btoa("x".repeat(12)) } };
    await expect(openExport(tampered, "export password")).rejects.toThrow(DecryptionError);
  });

  it("uses a key unrelated to the vault, even with the same password", async () => {
    const salt = generateSalt();
    const { encryptionKey } = await deriveKeys("same password", salt, FAST);
    const { vaultKey } = await createVaultKey(encryptionKey);
    const file = await createExport(items, "same password");
    // The vault key can't open the export.
    await expect(decryptItem(vaultKey, ID, file.data)).rejects.toThrow(DecryptionError);
  });
});
