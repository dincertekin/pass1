// Keeps the session token, encrypted by the operating system (Electron's safeStorage: the macOS
// Keychain, Windows DPAPI, or the Linux secret service). Only the main process ever holds it.
//
// Where the OS offers no real encryption (Linux without a keyring falls back to a fixed key),
// the token is kept in memory only, and the person logs in again after restarting the app.
// Security before convenience.

import { app, safeStorage } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TOKEN_FILE = "session-token.bin";
let tokenInMemory: string | null = null;
let hasLoaded = false;

async function canEncrypt(): Promise<boolean> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
  // "basic_text" is Linux's fallback with a hardcoded key: no better than plain text.
  return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
}

function tokenPath() {
  return join(app.getPath("userData"), TOKEN_FILE);
}

/** Output: the stored token, or null when logged out. */
export async function readToken(): Promise<string | null> {
  if (hasLoaded) return tokenInMemory;
  hasLoaded = true;
  try {
    if (!(await canEncrypt())) return null;
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(await readFile(tokenPath()));
    tokenInMemory = result;
    // The OS rotated its key or offers a stronger one: store the token under the new one.
    if (shouldReEncrypt) await writeToken(result);
  } catch {
    tokenInMemory = null;
  }
  return tokenInMemory;
}

/** Stores a token after logging in, or forgets it (null) after logging out. */
export async function writeToken(token: string | null): Promise<void> {
  tokenInMemory = token;
  hasLoaded = true;
  if (token === null) {
    await rm(tokenPath(), { force: true });
    return;
  }
  if (await canEncrypt()) await writeFile(tokenPath(), await safeStorage.encryptStringAsync(token), { mode: 0o600 });
}
