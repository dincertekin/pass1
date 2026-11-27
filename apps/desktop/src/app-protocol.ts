// Serves the web app from inside the desktop app, at app://pass1/. The pages are files that
// shipped with the app, never fetched from the server, so a compromised server can't change
// the code that decrypts the vault (accepted risk D in docs/security-review.md, for the web).
//
// Every response carries the same Content-Security-Policy as the web, from @pass1/shared, with
// a fresh style nonce for each page load, exactly like apps/api/src/web-app.ts.

import { contentSecurityPolicy, PERMISSIONS_POLICY, STYLE_NONCE_PLACEHOLDER } from "@pass1/shared";
import { protocol } from "electron";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";

export const APP_SCHEME = "app";
export const APP_HOST = "pass1";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/**
 * Must run before the app is ready. "standard" and "secure" make app://pass1 behave like an
 * HTTPS origin: the clipboard, Web Workers and the History API need that.
 */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

/** Answers app://pass1/... from the web build in `webDist`. Run once the app is ready. */
export function serveWebBuild(webDist: string) {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response("Not found", { status: 404 });

    const file = fileFor(webDist, decodeURIComponent(url.pathname));
    if (file) {
      try {
        return respond(new Uint8Array(await readFile(file)), CONTENT_TYPES[extname(file)] ?? "application/octet-stream", null);
      } catch {
        // Not a file: an app page like /vault, answered with index.html below.
      }
    }
    const nonce = randomBytes(16).toString("base64");
    const html = (await readFile(join(webDist, "index.html"), "utf8")).replaceAll(STYLE_NONCE_PLACEHOLDER, nonce);
    return respond(html, CONTENT_TYPES[".html"]!, nonce);
  });
}

/**
 * Input: the web build's folder and a URL path. Output: the file inside that folder, or null.
 * Paths that would leave the folder (../) are refused, so the page can't read other files.
 */
function fileFor(webDist: string, pathname: string): string | null {
  if (pathname === "/" || pathname === "/index.html" || !extname(pathname)) return null;
  const root = normalize(webDist) + sep;
  const file = normalize(join(root, pathname));
  return file.startsWith(root) ? file : null;
}

/** Every response gets the CSP; the nonce only matters for the HTML page. */
function respond(body: string | Uint8Array<ArrayBuffer>, contentType: string, nonce: string | null): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "content-security-policy": contentSecurityPolicy(nonce ?? randomBytes(16).toString("base64")),
      "permissions-policy": PERMISSIONS_POLICY,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  });
}
