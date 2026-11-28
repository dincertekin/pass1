import { NativeModule, requireNativeModule } from "expo";

// The native side of pass1's crypto on the phone (ios/Pass1CryptoModule.swift). Keys are
// handles like "key-3": the key bytes never leave native memory.

declare class Pass1CryptoNative extends NativeModule<{}> {
  argon2id(password: Uint8Array, salt: Uint8Array, memoryKiB: number, iterations: number, parallelism: number): Promise<Uint8Array>;
  hkdfAesKey(keyMaterial: Uint8Array, info: string): Promise<string>;
  hkdfBytes(keyMaterial: Uint8Array, info: string, length: number): Promise<Uint8Array>;
  importAesKey(raw: Uint8Array): Promise<string>;
  aesGcmEncrypt(key: string, iv: Uint8Array, plaintext: Uint8Array, associatedData: Uint8Array): Promise<Uint8Array>;
  aesGcmDecrypt(key: string, iv: Uint8Array, ciphertext: Uint8Array, associatedData: Uint8Array): Promise<Uint8Array>;
  randomBytes(length: number): Uint8Array;
  randomUUID(): string;
  /** Drops every key, for locking the vault. Their handles stop working. */
  forgetKeys(): void;
}

export default requireNativeModule<Pass1CryptoNative>("Pass1Crypto");
