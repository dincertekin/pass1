import {
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  PASSPHRASE_SEPARATORS,
  PASSPHRASE_WORDS,
  PASSWORD_LENGTH,
} from "@pass1/crypto";
import { useSyncExternalStore } from "react";
import { z } from "zod";

// Per-device preferences. They aren't secret, so they live in localStorage, but they're
// still validated on read: a broken or hand-edited value falls back to the default.

export const AUTO_LOCK_CHOICES = [1, 5, 15, 30, 60, 240] as const;
export const CLIPBOARD_CLEAR_CHOICES = [10, 30, 60, 120] as const;
export const LIST_WIDTH = { min: 260, max: 640, default: 340 } as const;

const settingsSchema = z.object({
  /** Lock the vault after this many minutes without activity. */
  autoLockMinutes: z.union(AUTO_LOCK_CHOICES.map((n) => z.literal(n))).catch(15),
  /** Clear copied passwords from the clipboard after this many seconds. */
  clipboardClearSeconds: z.union(CLIPBOARD_CLEAR_CHOICES.map((n) => z.literal(n))).catch(30),
  /** Lock as soon as the tab is hidden (switching tabs or apps, minimizing). */
  lockWhenHidden: z.boolean().catch(false),

  /** "system" follows the operating system's light or dark mode. */
  theme: z.enum(["system", "light", "dark"]).catch("system"),
  density: z.enum(["comfortable", "compact"]).catch("comfortable"),
  /** Colored tiles with the item's initial. Off: plain grey tiles. */
  colorfulTiles: z.boolean().catch(true),
  /** Width of the item list on desktop, set by dragging its edge (vault/PaneResizer.tsx). */
  listWidth: z.int().min(LIST_WIDTH.min).max(LIST_WIDTH.max).catch(LIST_WIDTH.default),

  /** Getting-started steps people tick off themselves (pass1 can't check these). */
  onboarding: z
    .object({ storedMasterPassword: z.boolean(), loggedInOnPhone: z.boolean() })
    .catch({ storedMasterPassword: false, loggedInOnPhone: false }),

  /** The generator remembers what you used last. */
  generatorKind: z.enum(["password", "passphrase"]).catch("password"),
  passwordOptions: z
    .object({
      length: z.int().min(PASSWORD_LENGTH.min).max(PASSWORD_LENGTH.max),
      lowercase: z.boolean(),
      uppercase: z.boolean(),
      digits: z.boolean(),
      symbols: z.boolean(),
      avoidAmbiguous: z.boolean(),
    })
    .catch(DEFAULT_PASSWORD_OPTIONS),
  passphraseOptions: z
    .object({
      words: z.int().min(PASSPHRASE_WORDS.min).max(PASSPHRASE_WORDS.max),
      separator: z.enum(PASSPHRASE_SEPARATORS),
      capitalize: z.boolean(),
      includeNumber: z.boolean(),
    })
    .catch(DEFAULT_PASSPHRASE_OPTIONS),
});

export type Settings = z.infer<typeof settingsSchema>;

const STORAGE_KEY = "pass1.settings";
const listeners = new Set<() => void>();
let current = read();

function read(): Settings {
  try {
    return settingsSchema.parse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return settingsSchema.parse({});
  }
}

export function getSettings(): Settings {
  return current;
}

export function updateSettings(change: Partial<Settings>) {
  current = { ...current, ...change };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage can be full or blocked (private mode). The setting still applies until reload.
  }
  listeners.forEach((listener) => listener());
}

/** Calls `listener` after every change. Returns a function that stops it. */
export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeToSettings, getSettings);
}
