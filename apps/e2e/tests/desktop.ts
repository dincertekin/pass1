import { _electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Starts the desktop app (apps/desktop, built by `npm run build`) against the test server.

export const DESKTOP_DIR = join(import.meta.dirname, "..", "..", "desktop");
const TEST_SERVER = "http://localhost:3200";

/** A fresh folder for the app's data (token, settings), so test runs never share a login. */
export function newUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), "pass1-desktop-"));
}

/**
 * Launches the app. Output: the app (for the main process) and its page (the window's contents).
 * The window fails the test on CSP violations and page errors, like the browser fixture.
 */
export async function launchDesktop(userDataDir: string): Promise<{ app: ElectronApplication; desktopPage: Page; problems: string[] }> {
  const app = await _electron.launch({
    args: [DESKTOP_DIR],
    env: { ...process.env, PASS1_SERVER_URL: TEST_SERVER, PASS1_USER_DATA_DIR: userDataDir, PASS1_TEST_KEYCHAIN: "mock" },
  });
  const desktopPage = await app.firstWindow();
  const problems: string[] = [];
  desktopPage.on("pageerror", (error) => problems.push(`Uncaught: ${error.message}`));
  desktopPage.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) problems.push(message.text());
  });
  return { app, desktopPage, problems };
}

/** True when the OS can really encrypt the token (not on Linux without a keyring). */
export function canKeepToken(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(
    async ({ safeStorage }) =>
      (await safeStorage.isAsyncEncryptionAvailable()) && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
  );
}
