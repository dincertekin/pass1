// Rules for every window and web page in the app. The page is treated like a website that may
// one day run injected script: it gets no Node.js, no way to open new windows or navigate away,
// and no browser permissions except writing to the clipboard (for copying passwords).

import { app, session, shell, type WebContents } from "electron";
import { APP_ORIGIN } from "./app-protocol.js";

// Copying a password needs this. Everything else (camera, location, notifications...) is refused.
const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"]);

/** Opens http and https links in the system browser. Anything else (file:, javascript:...) is ignored. */
export function openInBrowser(url: string) {
  try {
    const { protocol } = new URL(url);
    if (protocol === "https:" || protocol === "http:") void shell.openExternal(url);
  } catch {
    // Not a URL: nothing to open.
  }
}

/** True for URLs that belong to the app itself. */
export function isAppUrl(url: string): boolean {
  return url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`);
}

function guardWebContents(contents: WebContents) {
  // window.open and target=_blank links: never a new app window, the system browser instead.
  contents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: "deny" };
  });
  // Leaving the app's pages (a link, or Paddle's checkout): the system browser instead.
  contents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openInBrowser(url);
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

/** Applies the rules to every web page the app will ever create. Run once, before any window. */
export function hardenApp() {
  app.on("web-contents-created", (_event, contents) => guardWebContents(contents));
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission));
  });
}
