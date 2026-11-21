// Fetching vault changes from the server and folding them into the local copy.
// The server side, and why versions instead of timestamps, is in apps/api/src/vault/sync.ts.

import type { VaultItemResponse } from "@pass1/shared";
import { api } from "../lib/api";
import type { VaultEntry } from "./vault-store";

export interface VaultChanges {
  items: VaultItemResponse[];
  deletedIds: string[];
  /** Send this as `since` next time. */
  version: number;
  /** Throw the local copy away first: this is the whole vault. */
  replacesAll: boolean;
}

/**
 * Asks the server for everything that changed after `since`, following pages until the end.
 * Input: 0 for the whole vault, or the version from the last call. Output: the changes.
 */
export async function fetchChangesSince(since: number): Promise<VaultChanges> {
  const changes: VaultChanges = { items: [], deletedIds: [], version: since, replacesAll: false };
  for (;;) {
    const page = await api.listItems(changes.version);
    // Can happen on a later page too, if the server was restored from a backup mid-sync.
    if (page.replacesAll) {
      changes.items = [];
      changes.deletedIds = [];
      changes.replacesAll = true;
    }
    changes.items.push(...page.items);
    changes.deletedIds.push(...page.deletedIds);
    changes.version = page.version;
    if (!page.hasMore) return changes;
  }
}

/**
 * Folds synced entries into the local copy.
 * Input: the current entries (null before the first load) and the decrypted changes.
 * Output: the new list of entries.
 *
 * A sync can be slow. If it started before a save on this device, it carries the item as it
 * was before the save, and must not undo it. So the higher revision always wins.
 */
export function mergeSyncedEntries(
  current: VaultEntry[] | null,
  synced: VaultEntry[],
  deletedIds: string[],
  replacesAll: boolean,
): VaultEntry[] {
  if (replacesAll || current === null) return synced;

  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of synced) {
    const existing = byId.get(entry.id);
    if (existing && existing.revision > entry.revision) continue;
    byId.set(entry.id, entry);
  }
  for (const id of deletedIds) byId.delete(id);
  return [...byId.values()];
}
