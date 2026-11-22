// The browser's provider: Web Crypto for HKDF and AES-GCM, hash-wasm for Argon2id
// (Web Crypto has no Argon2). Also works in Node, which has the same Web Crypto API.

import { argon2id } from "hash-wasm";
import type { CryptoProvider } from "./provider";
import { utf8 } from "./encoding";

const KEY_LENGTH_BYTES = 32;
// crypto.getRandomValues refuses to fill more than this in one call (it throws QuotaExceededError).
const MAX_RANDOM_BYTES_PER_CALL = 65_536;

function hkdfParams(info: string) {
  return { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8.encode(info) };
}

/** Imports key material for HKDF only; non-extractable, so it can't be read back. */
function importHkdfKey(keyMaterial: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new Uint8Array(keyMaterial), "HKDF", false, ["deriveKey", "deriveBits"]);
}

export const webCryptoProvider: CryptoProvider<CryptoKey> = {
  async argon2id(password, salt, params) {
    return argon2id({
      password,
      salt,
      memorySize: params.memoryKiB,
      iterations: params.iterations,
      parallelism: params.parallelism,
      hashLength: KEY_LENGTH_BYTES,
      outputType: "binary",
    });
  },

  async hkdfAesKey(keyMaterial, info) {
    const hkdfKey = await importHkdfKey(keyMaterial);
    // Non-extractable: once derived, the key's bytes can't be read by JavaScript.
    return crypto.subtle.deriveKey(hkdfParams(info), hkdfKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  },

  async hkdfBytes(keyMaterial, info, length) {
    const hkdfKey = await importHkdfKey(keyMaterial);
    return new Uint8Array(await crypto.subtle.deriveBits(hkdfParams(info), hkdfKey, length * 8));
  },

  importAesKey(raw) {
    return crypto.subtle.importKey("raw", new Uint8Array(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  },

  async aesGcmEncrypt(key, iv, plaintext, associatedData) {
    const algorithm = { name: "AES-GCM", iv: new Uint8Array(iv), additionalData: new Uint8Array(associatedData) };
    return new Uint8Array(await crypto.subtle.encrypt(algorithm, key, new Uint8Array(plaintext)));
  },

  async aesGcmDecrypt(key, iv, ciphertext, associatedData) {
    const algorithm = { name: "AES-GCM", iv: new Uint8Array(iv), additionalData: new Uint8Array(associatedData) };
    return new Uint8Array(await crypto.subtle.decrypt(algorithm, key, new Uint8Array(ciphertext)));
  },

  randomBytes(length) {
    const bytes = new Uint8Array(length);
    for (let start = 0; start < length; start += MAX_RANDOM_BYTES_PER_CALL) {
      crypto.getRandomValues(bytes.subarray(start, start + MAX_RANDOM_BYTES_PER_CALL));
    }
    return bytes;
  },

  randomUUID() {
    return crypto.randomUUID();
  },
};
