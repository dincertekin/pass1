import type { VaultEntry } from "./vault-store";

// Small pure helpers for showing entries. Kept here so the components stay about layout.

export type Section = "all" | "favorites" | "trash";

export const SECTION_LABELS: Record<Section, string> = {
  all: "All items",
  favorites: "Favorites",
  trash: "Trash",
};

export function inSection(entry: VaultEntry, section: Section): boolean {
  if (section === "trash") return entry.deletedAt !== null;
  if (entry.deletedAt !== null) return false;
  return section === "all" || entry.item?.favorite === true;
}

/** Search looks at name, website and username. Never at passwords or notes. */
export function matchesQuery(entry: VaultEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { name = "", url = "", username = "" } = entry.item ?? {};
  return [name, url, username].some((field) => field.toLowerCase().includes(q));
}

export function displayName(entry: VaultEntry): string {
  return entry.item?.name || "Unreadable item";
}

export function sortByName(a: VaultEntry, b: VaultEntry): number {
  return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" });
}

/**
 * Turns what the user typed in the Website field into a safe link, or null.
 * Only http and https: a "javascript:" URL in an href would run code when clicked.
 */
export function safeHref(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** "github.com" from "https://github.com/login", for the list's second line. */
export function hostOf(url: string | undefined): string | null {
  const href = safeHref(url);
  return href ? new URL(href).hostname.replace(/^www\./, "") : null;
}
