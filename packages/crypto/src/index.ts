import { createVaultCrypto } from "./vault-crypto";
import { webCryptoProvider } from "./web-provider";

export { EXPORT_FORMAT } from "./export";
export type { ExportFile } from "./export";
export { DEFAULT_KDF_PARAMS } from "./kdf";
export type { DerivedKeys, KdfParams } from "./kdf";
export type { CryptoProvider } from "./provider";
export { createVaultCrypto, type VaultCrypto } from "./vault-crypto";
export { webCryptoProvider } from "./web-provider";
export { conformanceChecks, type ConformanceCheck } from "./conformance";
export {
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  PASSPHRASE_SEPARATORS,
  PASSPHRASE_WORDS,
  PASSWORD_LENGTH,
} from "./generator-options";
export type { PassphraseOptions, PasswordOptions } from "./generator-options";
export { DecryptionError, FORMAT_VERSION, PADDING_BLOCK, UnsupportedFormatError } from "./vault";
export type { EncryptedBlob, VaultItem } from "./vault";

// The browser's binding (Web Crypto and hash-wasm). The web app and the API's tests use these.
export const {
  generateSalt,
  deriveKeys,
  newItemId,
  createVaultKey,
  unwrapVaultKey,
  rewrapVaultKey,
  encryptItem,
  decryptItem,
  createExport,
  openExport,
} = createVaultCrypto(webCryptoProvider);
