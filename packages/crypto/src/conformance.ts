// Checks every crypto provider must pass before it may touch a real vault.
//
// A provider that differs from the browser's in a single bit would encrypt vaults that other
// devices can't open, or open them wrongly. So the checks use known answers: values from
// published specifications, or computed by two independent implementations that agree. A
// provider can't pass by agreeing with itself.
//
// They're plain functions, not tests for one test runner, so a phone app can run them on the
// device itself (vitest runs them here, in conformance.test.ts). Each throws when it fails.

import { fromBase64, utf8 } from "./encoding";
import type { KdfParams } from "./kdf";
import type { CryptoProvider } from "./provider";
import { createVaultCrypto } from "./vault-crypto";
import type { EncryptedBlob } from "./vault";

export interface ConformanceCheck {
  name: string;
  run(): Promise<void>;
}

const SMALL_KDF: KdfParams = { memoryKiB: 1024, iterations: 1, parallelism: 1 };
const PRODUCTION_KDF: KdfParams = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 };
const SALT_0_TO_15 = Uint8Array.from({ length: 16 }, (_, i) => i);
// Has an emoji, so UTF-8 handling is part of the answer.
const ARGON2_PASSWORD = "pass1-conformance-🔑";

// Computed with hash-wasm and with @node-rs/argon2 (Rust), which agreed.
const ARGON2_SMALL_ANSWER = "b2b234fb483f9d0edfc81ee5620dd55a309190742b3af98b6043cca23d39a1bc";
const ARGON2_PRODUCTION_ANSWER = "ef9ba1b8ec77dadd4ae57e2bc32649f66f569474670bdf042af1eba362bf3703";

// RFC 5869, test case 3: SHA-256, empty salt, empty info, the same shape pass1 uses.
const HKDF_RFC_INPUT = "0b".repeat(22);
const HKDF_RFC_ANSWER = "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8";
const HKDF_RFC_LENGTH = 42;

// The GCM specification (McGrew and Viega), test case 16: AES-256, 96-bit IV, with associated data.
const GCM_KEY = "feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308";
const GCM_IV = "cafebabefacedbaddecaf888";
const GCM_ASSOCIATED_DATA = "feedfacedeadbeeffeedfacedeadbeefabaddad2";
const GCM_PLAINTEXT =
  "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39";
const GCM_CIPHERTEXT_AND_TAG =
  "522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662" +
  "76fc6ece0f4e1768cddf8853bb2d551b";

// A vault in format v1, as stored on servers today. The same values as crypto.test.ts.
const PINNED = {
  password: "pass1-test-vector",
  salt: "AAECAwQFBgcICQoLDA0ODw==",
  authKey: "vtuEjJqJe5qj5sa4lZTmkevaEGFfy3YmI/0u0VMP6gA=",
  itemId: "00000000-0000-4000-8000-000000000001",
  wrappedVaultKey: {
    v: 1,
    iv: "19f6En9iVVFOOAEy",
    ciphertext: "beXCY3eWdlG/h0/FH8Rv5dm3aAaXA77hTKMLt+5PbXUwXdyy6RqNoPM7d2jBZIDI",
  } satisfies EncryptedBlob,
  item: {
    v: 1,
    iv: "oVMSFOiMD6xX53EQ",
    ciphertext:
      "9h5/6UwklGL8+9ybZ+JpanCIKA9thgxKrxt9tK23bYYCrc7LQJpb95eFAmSEztoomamr8m1GK2kCnPcyvN5hiVB6GFiFgj8Fe6s2ewAjdXVjCedmInyYFT7mmP+djG/KJmGPqa/s/zZYNhdYJUDFEaWtLniciD9D4HuUhL52OtcC3K8Pevp88nNRqBAZLt8tpCEawn9wjqf/mZHcwQ8xSFXdLkQ0dP/rdoqkRc3qW2BPQzQzer3+WxAqRNT+L3shpC1ffTojCxZnbGdqFHHvgVwTLKEZCCo+5J5As2VYsiirNtF3lp1dO/A932XONtwhq8QEdD14FXpW7WO2scdcLjvFHdFEVdnawDn/n/OlnHo=",
  } satisfies EncryptedBlob,
  decrypted: { name: "Pinned", password: "v1-format" },
};

const RANDOM_SAMPLES = 1000;
const RANDOM_BIAS_BYTES = 65_536;
// Over 524,288 fair random bits, the share of ones lands this close to half far more often
// than one time in a billion. A broken generator (constant, or a stuck bit) lands far outside.
const RANDOM_BIAS_TOLERANCE = 0.01;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROUND_TRIP_SIZES = [0, 1, 15, 16, 17, 255, 256, 4096, 70_000];

/**
 * Every check a provider must pass, in order.
 * Input: the provider to test. Output: checks to run, each { name, run() } that throws on failure.
 */
export function conformanceChecks<Key>(provider: CryptoProvider<Key>): ConformanceCheck[] {
  return [
    { name: "Argon2id gives the known answer with small settings", run: () => checkArgon2(provider, SMALL_KDF, ARGON2_SMALL_ANSWER) },
    {
      name: "Argon2id gives the known answer with production settings (64 MiB, 3 passes)",
      run: () => checkArgon2(provider, PRODUCTION_KDF, ARGON2_PRODUCTION_ANSWER),
    },
    { name: "HKDF-SHA256 gives the answer from RFC 5869", run: () => checkHkdf(provider) },
    { name: "an HKDF-derived AES key is the same key as one imported from HKDF's bytes", run: () => checkHkdfKeyMatchesBytes(provider) },
    { name: "AES-256-GCM gives the answer from the GCM specification", run: () => checkGcmKnownAnswer(provider) },
    { name: "AES-256-GCM refuses anything changed: ciphertext, tag, IV, associated data or key", run: () => checkGcmRefusesChanges(provider) },
    { name: "AES-256-GCM round-trips empty, odd-sized and large data", run: () => checkGcmRoundTrips(provider) },
    { name: "random bytes have the right length, never repeat and show no bias", run: () => checkRandomBytes(provider) },
    { name: "UUIDs are random (version 4) and never repeat", run: () => checkUuids(provider) },
    { name: "opens the pinned format v1 vault that servers store today", run: () => checkPinnedVault(provider) },
    { name: "items encrypted here open again only with the same key and item ID", run: () => checkItemRoundTrip(provider) },
  ];
}

async function checkArgon2<Key>(provider: CryptoProvider<Key>, params: KdfParams, answer: string) {
  const output = await provider.argon2id(utf8.encode(ARGON2_PASSWORD.normalize("NFKC")), SALT_0_TO_15, params);
  assertEqual(toHex(output), answer, "Argon2id output");
}

async function checkHkdf<Key>(provider: CryptoProvider<Key>) {
  const output = await provider.hkdfBytes(fromHex(HKDF_RFC_INPUT), "", HKDF_RFC_LENGTH);
  assertEqual(toHex(output), HKDF_RFC_ANSWER, "HKDF output");
}

async function checkHkdfKeyMatchesBytes<Key>(provider: CryptoProvider<Key>) {
  const material = provider.randomBytes(32);
  const derived = await provider.hkdfAesKey(material, "pass1/v1/encryption");
  const imported = await provider.importAesKey(await provider.hkdfBytes(material, "pass1/v1/encryption", 32));
  const iv = provider.randomBytes(12);
  const ciphertext = await provider.aesGcmEncrypt(derived, iv, utf8.encode("same key"), new Uint8Array(0));
  const plaintext = await provider.aesGcmDecrypt(imported, iv, ciphertext, new Uint8Array(0));
  assertEqual(utf8.decode(plaintext), "same key", "decrypted text");
}

async function checkGcmKnownAnswer<Key>(provider: CryptoProvider<Key>) {
  const key = await provider.importAesKey(fromHex(GCM_KEY));
  const ciphertext = await provider.aesGcmEncrypt(key, fromHex(GCM_IV), fromHex(GCM_PLAINTEXT), fromHex(GCM_ASSOCIATED_DATA));
  assertEqual(toHex(ciphertext), GCM_CIPHERTEXT_AND_TAG, "AES-GCM ciphertext and tag");
  const plaintext = await provider.aesGcmDecrypt(key, fromHex(GCM_IV), fromHex(GCM_CIPHERTEXT_AND_TAG), fromHex(GCM_ASSOCIATED_DATA));
  assertEqual(toHex(plaintext), GCM_PLAINTEXT, "AES-GCM plaintext");
}

async function checkGcmRefusesChanges<Key>(provider: CryptoProvider<Key>) {
  const key = await provider.importAesKey(fromHex(GCM_KEY));
  const otherKey = await provider.importAesKey(provider.randomBytes(32));
  const [iv, ciphertext, data] = [fromHex(GCM_IV), fromHex(GCM_CIPHERTEXT_AND_TAG), fromHex(GCM_ASSOCIATED_DATA)];
  const lastByte = ciphertext.length - 1;

  await assertRefused(provider.aesGcmDecrypt(key, iv, flipBit(ciphertext, 0), data), "a changed ciphertext");
  await assertRefused(provider.aesGcmDecrypt(key, iv, flipBit(ciphertext, lastByte), data), "a changed tag");
  await assertRefused(provider.aesGcmDecrypt(key, flipBit(iv, 0), ciphertext, data), "a changed IV");
  await assertRefused(provider.aesGcmDecrypt(key, iv, ciphertext, flipBit(data, 0)), "changed associated data");
  await assertRefused(provider.aesGcmDecrypt(otherKey, iv, ciphertext, data), "the wrong key");
  await assertRefused(provider.aesGcmDecrypt(key, iv, ciphertext.slice(0, lastByte), data), "a shortened tag");
}

async function checkGcmRoundTrips<Key>(provider: CryptoProvider<Key>) {
  const key = await provider.importAesKey(provider.randomBytes(32));
  for (const size of ROUND_TRIP_SIZES) {
    const plaintext = provider.randomBytes(size);
    const iv = provider.randomBytes(12);
    const data = utf8.encode(`size ${size}`);
    const ciphertext = await provider.aesGcmEncrypt(key, iv, plaintext, data);
    assertEqual(ciphertext.length, size + 16, `ciphertext length for ${size} bytes`);
    assertEqual(toHex(await provider.aesGcmDecrypt(key, iv, ciphertext, data)), toHex(plaintext), `${size}-byte round trip`);
  }
}

async function checkRandomBytes<Key>(provider: CryptoProvider<Key>) {
  const seen = new Set<string>();
  for (let i = 0; i < RANDOM_SAMPLES; i++) {
    const sample = provider.randomBytes(32);
    assertEqual(sample.length, 32, "random sample length");
    seen.add(toHex(sample));
  }
  assertEqual(seen.size, RANDOM_SAMPLES, "distinct random samples");

  let ones = 0;
  for (const byte of provider.randomBytes(RANDOM_BIAS_BYTES)) ones += countOnes(byte);
  const share = ones / (RANDOM_BIAS_BYTES * 8);
  if (Math.abs(share - 0.5) > RANDOM_BIAS_TOLERANCE) throw new Error(`random bits are ${(share * 100).toFixed(2)}% ones, expected about 50%`);
}

async function checkUuids<Key>(provider: CryptoProvider<Key>) {
  const seen = new Set<string>();
  for (let i = 0; i < RANDOM_SAMPLES; i++) {
    const uuid = provider.randomUUID();
    if (!UUID_V4.test(uuid)) throw new Error(`not a version 4 UUID: ${uuid}`);
    seen.add(uuid);
  }
  assertEqual(seen.size, RANDOM_SAMPLES, "distinct UUIDs");
}

async function checkPinnedVault<Key>(provider: CryptoProvider<Key>) {
  const vault = createVaultCrypto(provider);
  const { authKey, encryptionKey } = await vault.deriveKeys(PINNED.password, PINNED.salt, SMALL_KDF);
  assertEqual(authKey, PINNED.authKey, "auth key");
  const vaultKey = await vault.unwrapVaultKey(encryptionKey, PINNED.wrappedVaultKey);
  const item = await vault.decryptItem(vaultKey, PINNED.itemId, PINNED.item);
  assertEqual(JSON.stringify(item), JSON.stringify(PINNED.decrypted), "decrypted item");
}

async function checkItemRoundTrip<Key>(provider: CryptoProvider<Key>) {
  const vault = createVaultCrypto(provider);
  const { encryptionKey } = await vault.deriveKeys("round trip", vault.generateSalt(), SMALL_KDF);
  const { vaultKey, wrappedVaultKey } = await vault.createVaultKey(encryptionKey);
  const itemId = vault.newItemId();
  const blob = await vault.encryptItem(vaultKey, itemId, { name: "Bank", password: "Xp4$wN7!", notes: "ünïcödé 🔑" });

  const reopened = await vault.decryptItem(await vault.unwrapVaultKey(encryptionKey, wrappedVaultKey), itemId, blob);
  assertEqual(reopened.notes, "ünïcödé 🔑", "notes after a round trip");
  await assertRefused(vault.decryptItem(vaultKey, vault.newItemId(), blob), "another item's ID");
  const { encryptionKey: wrongKey } = await vault.deriveKeys("wrong password", vault.generateSalt(), SMALL_KDF);
  await assertRefused(vault.unwrapVaultKey(wrongKey, wrappedVaultKey), "a wrong master password");
  assertEqual(fromBase64(blob.iv).length, 12, "IV length");
}

function assertEqual<T>(actual: T, expected: T, what: string) {
  if (actual !== expected) throw new Error(`${what}: expected ${String(expected)}, got ${String(actual)}`);
}

async function assertRefused(attempt: Promise<unknown>, what: string) {
  try {
    await attempt;
  } catch {
    return;
  }
  throw new Error(`decryption succeeded with ${what}; it must fail`);
}

function flipBit(bytes: Uint8Array, index: number): Uint8Array {
  const copy = bytes.slice();
  copy[index]! ^= 1;
  return copy;
}

function countOnes(byte: number): number {
  let count = 0;
  for (let bits = byte; bits > 0; bits >>= 1) count += bits & 1;
  return count;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}
