import { describe, expect, it } from "vitest";
import { conformanceChecks } from "./conformance";
import type { CryptoProvider } from "./provider";
import { webCryptoProvider } from "./web-provider";

// Argon2id at 64 MiB takes a moment.
const SLOW_CHECK_MS = 30_000;

describe("The browser's crypto provider", () => {
  for (const check of conformanceChecks(webCryptoProvider)) {
    it(check.name, () => check.run(), SLOW_CHECK_MS);
  }
});

/** Runs every check. Output: names of the checks that failed. */
async function failingChecks(provider: CryptoProvider) {
  const failed: string[] = [];
  for (const check of conformanceChecks(provider)) {
    await check.run().catch(() => failed.push(check.name));
  }
  return failed;
}

// Each of these providers is wrong in a way that's easy to make when writing a native one.
// The suite is only worth something if it catches them.
describe("A provider with a subtle mistake", () => {
  it("fails when its random bytes aren't random", async () => {
    const failed = await failingChecks({ ...webCryptoProvider, randomBytes: (length) => new Uint8Array(length) });
    expect(failed).toContain("random bytes have the right length, never repeat and show no bias");
  }, SLOW_CHECK_MS);

  it("fails when Argon2id runs one pass too many", async () => {
    const failed = await failingChecks({
      ...webCryptoProvider,
      argon2id: (password, salt, params) => webCryptoProvider.argon2id(password, salt, { ...params, iterations: params.iterations + 1 }),
    });
    expect(failed).toContain("Argon2id gives the known answer with small settings");
    expect(failed).toContain("opens the pinned format v1 vault that servers store today");
  }, SLOW_CHECK_MS * 2);

  it("fails when HKDF ignores its label, even though RFC 5869's test uses an empty one", async () => {
    const failed = await failingChecks({
      ...webCryptoProvider,
      hkdfAesKey: (material) => webCryptoProvider.hkdfAesKey(material, ""),
      hkdfBytes: (material, _info, length) => webCryptoProvider.hkdfBytes(material, "", length),
    });
    expect(failed).not.toContain("HKDF-SHA256 gives the answer from RFC 5869");
    expect(failed).toContain("opens the pinned format v1 vault that servers store today");
  }, SLOW_CHECK_MS);

  it("fails when decryption ignores the associated data", async () => {
    const failed = await failingChecks({
      ...webCryptoProvider,
      aesGcmEncrypt: (key, iv, plaintext) => webCryptoProvider.aesGcmEncrypt(key, iv, plaintext, new Uint8Array(0)),
      aesGcmDecrypt: (key, iv, ciphertext) => webCryptoProvider.aesGcmDecrypt(key, iv, ciphertext, new Uint8Array(0)),
    });
    expect(failed).toContain("AES-256-GCM gives the answer from the GCM specification");
    expect(failed).toContain("items encrypted here open again only with the same key and item ID");
  }, SLOW_CHECK_MS);
});
