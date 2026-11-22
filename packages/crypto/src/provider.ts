// The cryptographic primitives pass1 needs, and nothing else. Browsers use Web Crypto and
// hash-wasm (web-provider.ts); a phone app supplies native ones. Everything above this layer
// (key derivation, wrapping, item format, padding) is shared code, so it can't drift apart.
//
// A provider is only trusted once it passes every check in conformance.ts on the device itself.

import type { KdfParams } from "./kdf";

/**
 * A provider's AES-256-GCM key. Opaque on purpose: the browser's is a non-extractable
 * CryptoKey, and a native provider can keep its keys in native memory the same way.
 */
export interface CryptoProvider<Key = CryptoKey> {
  /** Argon2id with a 32-byte output. Input: the password's UTF-8 bytes, a 16-byte salt, cost settings. */
  argon2id(password: Uint8Array, salt: Uint8Array, params: KdfParams): Promise<Uint8Array>;

  /** HKDF-SHA256 with an empty salt, giving an AES-256-GCM key. Input: key material, a label like "pass1/v1/encryption". */
  hkdfAesKey(keyMaterial: Uint8Array, info: string): Promise<Key>;

  /** HKDF-SHA256 with an empty salt, giving `length` bytes. */
  hkdfBytes(keyMaterial: Uint8Array, info: string, length: number): Promise<Uint8Array>;

  /** Turns 32 raw bytes into an AES-256-GCM key that can't be read back out. */
  importAesKey(raw: Uint8Array): Promise<Key>;

  /** AES-256-GCM. Output: ciphertext followed by the 16-byte tag, like Web Crypto. */
  aesGcmEncrypt(key: Key, iv: Uint8Array, plaintext: Uint8Array, associatedData: Uint8Array): Promise<Uint8Array>;

  /** The reverse of aesGcmEncrypt. Must throw (anything) when the tag doesn't match. */
  aesGcmDecrypt(key: Key, iv: Uint8Array, ciphertext: Uint8Array, associatedData: Uint8Array): Promise<Uint8Array>;

  /** Bytes from the system's cryptographically secure random source. */
  randomBytes(length: number): Uint8Array<ArrayBuffer>;

  /** A random (version 4) UUID, like "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed". */
  randomUUID(): string;
}
