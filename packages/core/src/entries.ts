import type { VaultItem } from "@pass1/crypto";
import type { MessageKey } from "./i18n/translate";

// Vault entries as every app holds them once decrypted, and small helpers for showing them.

export interface VaultEntry {
  id: string;
  revision: number;
  updatedAt: number;
  /** Set when the item is in the trash. */
  deletedAt: number | null;
  /** Bytes this item counts against the plan's storage limit. */
  size: number;
  /** null when the item couldn't be decrypted, which means it was corrupted or tampered with. */
  item: VaultItem | null;
}

export type Section = "all" | "favorites" | "health" | "trash";

/** Each section's name, as a message key (see i18n/en.ts). */
export const SECTION_MESSAGES: Record<Section, MessageKey> = {
  all: "section.all",
  favorites: "section.favorites",
  health: "section.health",
  trash: "section.trash",
};

/** `hasHealthIssue`: the item's password is weak or reused (see health.ts). */
export function inSection(entry: VaultEntry, section: Section, hasHealthIssue = false): boolean {
  if (section === "trash") return entry.deletedAt !== null;
  if (entry.deletedAt !== null) return false;
  if (section === "favorites") return entry.item?.favorite === true;
  if (section === "health") return hasHealthIssue;
  return true;
}

/** Search looks at name, website and username. Never at passwords or notes. */
export function matchesQuery(entry: VaultEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { name = "", url = "", username = "" } = entry.item ?? {};
  return [name, url, username].some((field) => field.toLowerCase().includes(q));
}

/** Input: an entry. Output: its name, or null when it couldn't be decrypted (each app shows its own words for that). */
export function displayName(entry: VaultEntry): string | null {
  return entry.item?.name || null;
}

/** For sorting by name, A to Z, ignoring case. Unreadable items come first. */
export function sortByName(a: VaultEntry, b: VaultEntry): number {
  return (displayName(a) ?? "").localeCompare(displayName(b) ?? "", undefined, { sensitivity: "base" });
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
