import { utf8 } from "./encoding";
import type { CryptoProvider } from "./provider";
import { DEFAULT_KDF_PARAMS, deriveExportKey, generateSalt, type KdfParams } from "./kdf";
import { decryptBytes, encryptBytes, pad, unpad, type EncryptedBlob, type VaultItem } from "./vault";

// Encrypted export files. A file is safe to keep anywhere (a USB stick, cloud storage):
// without the export password it's just ciphertext. It doesn't depend on the pass1
// account, so it still opens after the account is deleted or the master password changes.
//
//   export password --Argon2id(salt)--> --HKDF "pass1/v1/export"--> AES-256-GCM key
//   data = AES-GCM(key, padded JSON array of items, AAD "pass1/v1/export")

export const EXPORT_FORMAT = "pass1-export";
const EXPORT_AAD = "pass1/v1/export";

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: 1;
  /** ISO date, shown when importing. Not secret. */
  exportedAt: string;
  kdfSalt: string;
  kdfParams: KdfParams;
  data: EncryptedBlob;
}

export async function createExport<Key>(provider: CryptoProvider<Key>, items: VaultItem[], password: string): Promise<ExportFile> {
  const kdfSalt = generateSalt(provider);
  const key = await deriveExportKey(provider, password, kdfSalt, DEFAULT_KDF_PARAMS);
  const data = await encryptBytes(provider, key, pad(utf8.encode(JSON.stringify(items))), EXPORT_AAD);
  return { format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), kdfSalt, kdfParams: DEFAULT_KDF_PARAMS, data };
}

/**
 * Throws DecryptionError for a wrong password or a modified file. Check the file's shape
 * (including KDF bounds) before calling this; @pass1/shared has exportFileSchema for that.
 */
export async function openExport<Key>(provider: CryptoProvider<Key>, file: ExportFile, password: string): Promise<VaultItem[]> {
  const key = await deriveExportKey(provider, password, file.kdfSalt, file.kdfParams);
  const plaintext = unpad(await decryptBytes(provider, key, file.data, EXPORT_AAD));
  return JSON.parse(utf8.decode(plaintext)) as VaultItem[];
}
