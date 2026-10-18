import { argon2id } from "hash-wasm";
import { fromBase64, randomBytes, toBase64, utf8 } from "./encoding";

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

export interface DerivedKeys {
  /** Wraps/unwraps the vault key. Never leaves the browser. */
  encryptionKey: CryptoKey;
  /** Sent to the server in place of the password; the server hashes it again. */
  authKey: string;
}

// Changing these labels changes every derived key and locks out every user.
const ENCRYPTION_INFO = "pass1/v1/encryption";
const AUTH_INFO = "pass1/v1/auth";

export function generateSalt(): string {
  return toBase64(randomBytes(SALT_LENGTH));
}

/**
 * master password --Argon2id--> master key --HKDF--> { encryption key, auth key }
 *
 * Splitting with HKDF means the value the server sees (auth key) cannot be
 * used to recover the key that decrypts the vault.
 */
export async function deriveKeys(
  masterPassword: string,
  saltB64: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<DerivedKeys> {
  const masterKey = await argon2id({
    password: masterPassword.normalize("NFKC"),
    salt: fromBase64(saltB64),
    memorySize: params.memoryKiB,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: "binary",
  });

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(masterKey),
    "HKDF",
    false,
    ["deriveKey", "deriveBits"],
  );

  const encryptionKey = await crypto.subtle.deriveKey(
    hkdfParams(ENCRYPTION_INFO),
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  const authBits = await crypto.subtle.deriveBits(hkdfParams(AUTH_INFO), hkdfKey, 256);

  return { encryptionKey, authKey: toBase64(new Uint8Array(authBits)) };
}

function hkdfParams(info: string) {
  return { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8.encode(info) };
}
