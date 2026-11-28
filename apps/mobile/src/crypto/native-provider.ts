import type { CryptoProvider } from "@pass1/crypto";
import Pass1Crypto from "../../modules/pass1-crypto/src/Pass1CryptoModule";

// The phone's crypto provider: the native module (modules/pass1-crypto) behind the same interface
// the browser's Web Crypto provider implements. Keys are handles; their bytes stay native.

/** Native code may hand back a view into a bigger buffer; the interface wants a plain array. */
function ownBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

export const nativeCryptoProvider: CryptoProvider<string> = {
  argon2id: async (password, salt, params) =>
    ownBytes(await Pass1Crypto.argon2id(password, salt, params.memoryKiB, params.iterations, params.parallelism)),
  hkdfAesKey: (keyMaterial, info) => Pass1Crypto.hkdfAesKey(keyMaterial, info),
  hkdfBytes: async (keyMaterial, info, length) => ownBytes(await Pass1Crypto.hkdfBytes(keyMaterial, info, length)),
  importAesKey: (raw) => Pass1Crypto.importAesKey(raw),
  aesGcmEncrypt: async (key, iv, plaintext, associatedData) => ownBytes(await Pass1Crypto.aesGcmEncrypt(key, iv, plaintext, associatedData)),
  aesGcmDecrypt: async (key, iv, ciphertext, associatedData) => ownBytes(await Pass1Crypto.aesGcmDecrypt(key, iv, ciphertext, associatedData)),
  randomBytes: (length) => ownBytes(Pass1Crypto.randomBytes(length)),
  randomUUID: () => Pass1Crypto.randomUUID(),
};
