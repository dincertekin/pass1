import { fromBase64, randomBytes, toBase64, utf8 } from "./encoding";

/**
 * Version of the stored format. Bump it only together with code that can still read
 * every older version, because users' vaults on the server are written in the old one.
 */
export const FORMAT_VERSION = 1;

/** What the server stores: opaque ciphertext plus what's needed to decrypt it. */
export interface EncryptedBlob {
  v: typeof FORMAT_VERSION;
  iv: string;
  ciphertext: string;
}

/** A single vault entry. Every field is encrypted, so the server learns nothing but its padded size. */
export interface VaultItem {
  name: string;
  url?: string;
  username?: string;
  password: string;
  notes?: string;
  /** Kept inside the encrypted item, so the server doesn't learn which items matter most. */
  favorite?: boolean;
}

// AES-GCM standard nonce size. A fresh random IV is generated for every encryption;
// reusing one with the same key breaks GCM's confidentiality and integrity.
const IV_LENGTH = 12;
const VAULT_KEY_LENGTH = 32;

// Plaintext is padded up to a multiple of this, so a 6-character and a 30-character
// password produce the same ciphertext size. Long notes still reveal their size to the nearest 256 bytes.
export const PADDING_BLOCK = 256;
const LENGTH_PREFIX_BYTES = 4;

// Associated data: authenticated but not encrypted. Decryption fails unless the same value is
// given again, which ties each ciphertext to the one place it belongs.
const VAULT_KEY_AAD = "pass1/v1/vault-key";
const itemAad = (itemId: string) => `pass1/v1/item/${itemId}`;

export class DecryptionError extends Error {
  constructor() {
    super("Decryption failed: wrong key, wrong item ID or tampered data");
    this.name = "DecryptionError";
  }
}

export class UnsupportedFormatError extends Error {
  constructor(version: unknown) {
    super(`Unsupported encrypted format version: ${String(version)}`);
    this.name = "UnsupportedFormatError";
  }
}

/**
 * Item IDs are created in the browser, before encryption, because the ID is bound into the
 * ciphertext. The server only checks that it's a UUID and that it isn't taken.
 */
export function newItemId(): string {
  return crypto.randomUUID();
}

/**
 * Creates a new random vault key and returns it both as a usable key and wrapped
 * (encrypted) under the user's encryption key for storage on the server.
 *
 * Items are encrypted with the vault key, not the password-derived key, so changing
 * the master password only requires re-wrapping this one key.
 */
export async function createVaultKey(
  encryptionKey: CryptoKey,
): Promise<{ vaultKey: CryptoKey; wrappedVaultKey: EncryptedBlob }> {
  const raw = randomBytes(VAULT_KEY_LENGTH);
  const wrappedVaultKey = await encryptBytes(encryptionKey, raw, VAULT_KEY_AAD);
  const vaultKey = await importVaultKey(raw);
  raw.fill(0);
  return { vaultKey, wrappedVaultKey };
}

export async function unwrapVaultKey(
  encryptionKey: CryptoKey,
  wrappedVaultKey: EncryptedBlob,
): Promise<CryptoKey> {
  const raw = await decryptBytes(encryptionKey, wrappedVaultKey, VAULT_KEY_AAD);
  const vaultKey = await importVaultKey(raw);
  raw.fill(0);
  return vaultKey;
}

/**
 * Re-encrypts the vault key under a new encryption key, for changing the master password.
 * Items don't need re-encrypting: they stay encrypted with the same vault key.
 *
 * The vault key is non-extractable, so its raw bytes come from decrypting the stored copy.
 * They exist only inside this function and are zeroed before it returns.
 */
export async function rewrapVaultKey(
  oldEncryptionKey: CryptoKey,
  wrappedVaultKey: EncryptedBlob,
  newEncryptionKey: CryptoKey,
): Promise<EncryptedBlob> {
  const raw = await decryptBytes(oldEncryptionKey, wrappedVaultKey, VAULT_KEY_AAD);
  try {
    return await encryptBytes(newEncryptionKey, raw, VAULT_KEY_AAD);
  } finally {
    raw.fill(0);
  }
}

export async function encryptItem(vaultKey: CryptoKey, itemId: string, item: VaultItem): Promise<EncryptedBlob> {
  return encryptBytes(vaultKey, pad(utf8.encode(JSON.stringify(item))), itemAad(itemId));
}

export async function decryptItem(vaultKey: CryptoKey, itemId: string, blob: EncryptedBlob): Promise<VaultItem> {
  const padded = await decryptBytes(vaultKey, blob, itemAad(itemId));
  return JSON.parse(utf8.decode(unpad(padded))) as VaultItem;
}

/** [4-byte big-endian length][data][zero bytes up to a multiple of PADDING_BLOCK] */
/** @internal Used by export.ts. */
export function pad(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const total = Math.ceil((LENGTH_PREFIX_BYTES + data.length) / PADDING_BLOCK) * PADDING_BLOCK;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(data, LENGTH_PREFIX_BYTES);
  return out;
}

/** @internal */
export function unpad(padded: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const length = new DataView(padded.buffer, padded.byteOffset).getUint32(0);
  if (LENGTH_PREFIX_BYTES + length > padded.length) throw new DecryptionError();
  return padded.slice(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + length);
}

// Non-extractable: once imported, the raw key bytes can't be read back out by JS.
function importVaultKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** @internal */
export async function encryptBytes(key: CryptoKey, plaintext: Uint8Array<ArrayBuffer>, aad: string): Promise<EncryptedBlob> {
  const iv = randomBytes(IV_LENGTH);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8.encode(aad) },
    key,
    plaintext,
  );
  return { v: FORMAT_VERSION, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

/** @internal */
export async function decryptBytes(key: CryptoKey, blob: EncryptedBlob, aad: string): Promise<Uint8Array<ArrayBuffer>> {
  if (blob.v !== FORMAT_VERSION) throw new UnsupportedFormatError(blob.v);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(blob.iv), additionalData: utf8.encode(aad) },
      key,
      fromBase64(blob.ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch {
    // GCM authentication failure: don't leak which part was wrong.
    throw new DecryptionError();
  }
}
