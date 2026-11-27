import { displayName, type VaultEntry } from "@pass1/core";
import { t } from "../lib/i18n";

/** Input: an entry. Output: its name, or "Unreadable item" when it couldn't be decrypted. */
export function itemName(entry: VaultEntry): string {
  return displayName(entry) ?? t("item.unreadable");
}
