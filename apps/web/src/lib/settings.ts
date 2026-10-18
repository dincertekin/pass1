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

const settingsSchema = z.object({
  /** Lock the vault after this many minutes without activity. */
  autoLockMinutes: z.union(AUTO_LOCK_CHOICES.map((n) => z.literal(n))).catch(15),
  /** Clear copied passwords from the clipboard after this many seconds. */
  clipboardClearSeconds: z.union(CLIPBOARD_CLEAR_CHOICES.map((n) => z.literal(n))).catch(30),

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

export function useSettings(): Settings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSettings,
  );
}
