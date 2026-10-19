import type { VaultItem } from "@pass1/crypto";
import { parseCsv } from "./csv";

// Turns another password manager's export into pass1 items. Everything happens in this
// browser: the file is read here, and only the encrypted items are sent to the server.

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

// Column names used by Chrome, Edge, Safari, Firefox, 1Password and Bitwarden CSV exports.
// Compared in lower case.
const COLUMNS = {
  name: ["name", "title"],
  url: ["url", "website", "login_uri", "uri"],
  username: ["username", "login_username", "login", "email"],
  password: ["password", "login_password"],
  notes: ["notes", "note", "extra", "comments"],
  favorite: ["favorite"],
};

/** Reads a CSV or Bitwarden JSON export. Throws ImportFileError with a sentence for the user. */
export function itemsFromFile(fileName: string, text: string): VaultItem[] {
  const items = fileName.toLowerCase().endsWith(".json") ? itemsFromBitwardenJson(text) : itemsFromCsv(text);
  if (items.length === 0) throw new ImportFileError("No passwords found in this file.");
  return items;
}

export function itemsFromCsv(text: string): VaultItem[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new ImportFileError("This file is empty.");

  const names = header.map((h) => h.trim().toLowerCase());
  const column = (key: keyof typeof COLUMNS) => names.findIndex((n) => COLUMNS[key].includes(n));
  const at = { name: column("name"), url: column("url"), username: column("username"), password: column("password"), notes: column("notes"), favorite: column("favorite") };
  if (at.password === -1) {
    throw new ImportFileError("This CSV has no password column. Export from your password manager as CSV and try again.");
  }

  return rows.map((row) => {
    const get = (index: number) => (index === -1 ? "" : (row[index] ?? "").trim());
    return toItem({
      name: get(at.name),
      url: get(at.url),
      username: get(at.username),
      password: rawField(row, at.password),
      notes: rawField(row, at.notes),
      favorite: ["1", "true", "yes"].includes(get(at.favorite).toLowerCase()),
    });
  }).filter((item): item is VaultItem => item !== null);
}

/** Passwords and notes keep their exact spacing; other fields are trimmed. */
function rawField(row: string[], i: number) {
  return i === -1 ? "" : (row[i] ?? "");
}

interface BitwardenJson {
  encrypted?: boolean;
  items?: {
    type?: number;
    name?: string;
    notes?: string | null;
    favorite?: boolean;
    login?: { username?: string | null; password?: string | null; uris?: { uri?: string | null }[] | null } | null;
  }[];
}

export function itemsFromBitwardenJson(text: string): VaultItem[] {
  let data: BitwardenJson;
  try {
    data = JSON.parse(text) as BitwardenJson;
  } catch {
    throw new ImportFileError("This file isn't valid JSON.");
  }
  if (data.encrypted) {
    throw new ImportFileError("This is an encrypted Bitwarden export. Export again as unencrypted JSON or CSV, import it, then delete the file.");
  }
  if (!Array.isArray(data.items)) throw new ImportFileError("This isn't a Bitwarden JSON export.");

  return data.items
    .filter((it) => it.type === 1 || it.type === 2) // 1 = login, 2 = secure note
    .map((it) =>
      toItem({
        name: it.name ?? "",
        url: it.login?.uris?.[0]?.uri ?? "",
        username: it.login?.username ?? "",
        password: it.login?.password ?? "",
        notes: it.notes ?? "",
        favorite: !!it.favorite,
      }),
    )
    .filter((item): item is VaultItem => item !== null);
}

function toItem(raw: { name: string; url: string; username: string; password: string; notes: string; favorite: boolean }): VaultItem | null {
  // A row with neither a password nor notes has nothing worth keeping.
  if (!raw.password && !raw.notes.trim()) return null;
  return {
    name: raw.name.trim() || hostnameOf(raw.url) || "Untitled",
    password: raw.password,
    ...(raw.username.trim() && { username: raw.username.trim() }),
    ...(raw.url.trim() && { url: raw.url.trim() }),
    ...(raw.notes.trim() && { notes: raw.notes }),
    ...(raw.favorite && { favorite: true }),
  };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
