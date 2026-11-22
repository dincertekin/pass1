import { fromBase64, toBase64, utf8 } from "./encoding";
import type { CryptoProvider } from "./provider";

/**
 * Argon2id cost parameters. Stored per user on the server so they can be
 * raised later without breaking existing accounts.
 */
export interface KdfParams {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

// OWASP-recommended baseline for Argon2id (64 MiB, 3 passes).
export const DEFAULT_KDF_PARAMS: KdfParams = {
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
};

export const SALT_LENGTH = 16;

export interface DerivedKeys<Key = CryptoKey> {
  /** Wraps/unwraps the vault key. Never leaves the browser. */
  encryptionKey: Key;
  /** Sent to the server in place of the password; the server hashes it again. */
  authKey: string;
}

// Changing these labels changes every derived key and locks out every user.
const ENCRYPTION_INFO = "pass1/v1/encryption";
const AUTH_INFO = "pass1/v1/auth";
const EXPORT_INFO = "pass1/v1/export";
const AUTH_KEY_BYTES = 32;

/** Input: a provider. Output: a new random salt, base64, e.g. "AAECAwQFBgcICQoLDA0ODw==". */
export function generateSalt<Key>(provider: CryptoProvider<Key>): string {
  return toBase64(provider.randomBytes(SALT_LENGTH));
}

/**
 * master password --Argon2id--> master key --HKDF--> { encryption key, auth key }
 *
 * Splitting with HKDF means the value the server sees (auth key) cannot be
 * used to recover the key that decrypts the vault.
 */
export async function deriveKeys<Key>(
  provider: CryptoProvider<Key>,
  masterPassword: string,
  saltB64: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<DerivedKeys<Key>> {
  const masterKey = await stretchPassword(provider, masterPassword, saltB64, params);
  try {
    const encryptionKey = await provider.hkdfAesKey(masterKey, ENCRYPTION_INFO);
    const authKey = toBase64(await provider.hkdfBytes(masterKey, AUTH_INFO, AUTH_KEY_BYTES));
    return { encryptionKey, authKey };
  } finally {
    masterKey.fill(0);
  }
}

/**
 * The key that encrypts an export file, from the password chosen when exporting.
 * A different HKDF label from deriveKeys(), so even when the export password equals the
 * master password, the export key and the vault's encryption key are unrelated.
 */
export async function deriveExportKey<Key>(provider: CryptoProvider<Key>, password: string, saltB64: string, params: KdfParams): Promise<Key> {
  const masterKey = await stretchPassword(provider, password, saltB64, params);
  try {
    return await provider.hkdfAesKey(masterKey, EXPORT_INFO);
  } finally {
    masterKey.fill(0);
  }
}

/**
 * password --Argon2id--> 32 bytes. The caller zeroes them once the HKDF keys are derived.
 * NFKC first, so the same password typed on a Mac and on Windows (which can compose accented
 * letters differently) gives the same key.
 */
function stretchPassword<Key>(provider: CryptoProvider<Key>, password: string, saltB64: string, params: KdfParams) {
  return provider.argon2id(utf8.encode(password.normalize("NFKC")), fromBase64(saltB64), params);
}
