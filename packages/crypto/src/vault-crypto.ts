// Binds every vault crypto function to one provider, so callers never pass it around.
// index.ts exports the browser's binding; a phone app makes its own with its native provider.

import { createExport, openExport, type ExportFile } from "./export";
import { DEFAULT_KDF_PARAMS, deriveKeys, generateSalt, type KdfParams } from "./kdf";
import type { CryptoProvider } from "./provider";
import {
  createVaultKey,
  decryptItem,
  encryptItem,
  newItemId,
  rewrapVaultKey,
  unwrapVaultKey,
  type EncryptedBlob,
  type VaultItem,
} from "./vault";

/**
 * The vault's crypto functions, running on the given provider.
 * Input: a provider that passed conformance.ts. Output: deriveKeys, encryptItem and the rest.
 */
export function createVaultCrypto<Key>(provider: CryptoProvider<Key>) {
  return {
    generateSalt: () => generateSalt(provider),
    deriveKeys: (masterPassword: string, saltB64: string, params: KdfParams = DEFAULT_KDF_PARAMS) =>
      deriveKeys(provider, masterPassword, saltB64, params),
    newItemId: () => newItemId(provider),
    createVaultKey: (encryptionKey: Key) => createVaultKey(provider, encryptionKey),
    unwrapVaultKey: (encryptionKey: Key, wrappedVaultKey: EncryptedBlob) => unwrapVaultKey(provider, encryptionKey, wrappedVaultKey),
    rewrapVaultKey: (oldEncryptionKey: Key, wrappedVaultKey: EncryptedBlob, newEncryptionKey: Key) =>
      rewrapVaultKey(provider, oldEncryptionKey, wrappedVaultKey, newEncryptionKey),
    encryptItem: (vaultKey: Key, itemId: string, item: VaultItem) => encryptItem(provider, vaultKey, itemId, item),
    decryptItem: (vaultKey: Key, itemId: string, blob: EncryptedBlob) => decryptItem(provider, vaultKey, itemId, blob),
    createExport: (items: VaultItem[], password: string) => createExport(provider, items, password),
    openExport: (file: ExportFile, password: string) => openExport(provider, file, password),
  };
}

export type VaultCrypto<Key = CryptoKey> = ReturnType<typeof createVaultCrypto<Key>>;
