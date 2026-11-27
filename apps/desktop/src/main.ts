// The desktop app's main process: one hardened window showing the web app from inside the app
// (app-protocol.ts), API requests sent on the page's behalf (api-bridge.ts), and the vault
// locked when the computer sleeps or its screen locks.

import { DESKTOP_CHANNELS } from "@pass1/shared";
import { app, BrowserWindow, dialog, ipcMain, powerMonitor } from "electron";
import { join } from "node:path";
import { sendApiRequest } from "./api-bridge.js";
import { APP_ORIGIN, registerAppScheme, serveWebBuild } from "./app-protocol.js";
import { hardenApp, isAppUrl } from "./hardening.js";
import { validateRequest } from "./request-validation.js";
import { readServerAddress } from "./server-address.js";

const WINDOW_SIZE = { width: 1280, height: 820, minWidth: 380, minHeight: 560 };
// Windows and Linux show this in the title bar and taskbar. macOS uses pass1.icns from the app bundle.
const WINDOW_ICON = join(app.getAppPath(), "icons", "pass1.png");

// Tests give each run its own folder, so their tokens and settings never mix, and a fake
// keychain, so they never touch the real one of whoever runs them (macOS would also stop and ask
// for permission, which hangs the tests).
if (process.env.PASS1_USER_DATA_DIR) app.setPath("userData", process.env.PASS1_USER_DATA_DIR);
if (process.env.PASS1_TEST_KEYCHAIN === "mock") app.commandLine.appendSwitch("use-mock-keychain");

registerAppScheme();
hardenApp();

// One copy of the app at a time; opening it again brings the existing window forward.
if (!app.requestSingleInstanceLock()) app.quit();

/** The web build: shipped inside the packaged app, or apps/web/dist during development. */
function webBuildFolder(): string {
  return app.isPackaged ? join(process.resourcesPath, "web") : join(app.getAppPath(), "..", "web", "dist");
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...WINDOW_SIZE,
    title: "pass1",
    icon: WINDOW_ICON,
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      // Spellcheck would look at what's typed into fields, passwords included.
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  void window.loadURL(`${APP_ORIGIN}/`);
  return window;
}

function lockOnSleep(getWindow: () => BrowserWindow | null) {
  const lock = () => getWindow()?.webContents.send(DESKTOP_CHANNELS.lockRequested);
  powerMonitor.on("suspend", lock);
  powerMonitor.on("lock-screen", lock);
}

app.whenReady().then(() => {
  // During development the Dock would show Electron's own icon.
  if (!app.isPackaged) app.dock?.setIcon(WINDOW_ICON);
  const server = readServerAddress();
  if ("error" in server) {
    dialog.showErrorBox("pass1 can't start", server.error);
    app.quit();
    return;
  }

  serveWebBuild(webBuildFolder());
  ipcMain.handle(DESKTOP_CHANNELS.apiRequest, async (event, input: unknown) => {
    // Only the app's own page may send API requests.
    if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) throw new Error("Not allowed");
    const request = validateRequest(input);
    if (!request) throw new Error("Invalid API request");
    return sendApiRequest(server.url, request);
  });

  let window: BrowserWindow | null = createWindow();
  window.on("closed", () => (window = null));
  lockOnSleep(() => window);
  app.on("second-instance", () => window?.focus());
  app.on("activate", () => {
    if (!window) {
      window = createWindow();
      window.on("closed", () => (window = null));
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
