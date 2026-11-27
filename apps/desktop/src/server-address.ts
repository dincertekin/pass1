// Which pass1 server this desktop app talks to.
//
// From the PASS1_SERVER_URL environment variable, or { "serverUrl": "https://..." } in
// server.json in the app's data folder. During development (not packaged) it defaults to the
// API on localhost. HTTPS is required except for localhost: the token and every vault change
// travel over this connection.
// TODO: a first-run screen to choose the server, once the hosted service has an address. Letting
// people type any URL is a phishing risk to think through (see docs/cross-platform-roadmap.md).

import { app } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEVELOPMENT_SERVER = "http://localhost:3000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Output: the server's address without a trailing slash, e.g. "https://pass1.example.com", or an error to show. */
export function readServerAddress(): { url: string } | { error: string } {
  const configured = process.env.PASS1_SERVER_URL ?? readConfigFile() ?? (app.isPackaged ? null : DEVELOPMENT_SERVER);
  if (!configured) {
    return { error: `Set the pass1 server's address in ${configFilePath()}, like {"serverUrl": "https://pass1.example.com"}.` };
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return { error: `The server address "${configured}" isn't a URL.` };
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    return { error: `The server address must start with https:// (got ${url.origin}).` };
  }
  return { url: url.origin };
}

function configFilePath() {
  return join(app.getPath("userData"), "server.json");
}

function readConfigFile(): string | null {
  try {
    const parsed = JSON.parse(readFileSync(configFilePath(), "utf8")) as { serverUrl?: unknown };
    return typeof parsed.serverUrl === "string" ? parsed.serverUrl : null;
  } catch {
    return null;
  }
}
