import { fetchChangesSince, mergeSyncedEntries, type VaultEntry } from "@pass1/core";
import { decryptItem, encryptItem, newItemId, type VaultItem } from "@pass1/crypto";
import { storedSize, type VaultItemResponse } from "@pass1/shared";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";

// The decrypted vault, held in memory while it's unlocked. When the vault locks, the screen
// that owns this provider unmounts and the plaintext goes with it.
//
// Every change follows the same order: encrypt, send to the server, and only after the server
// accepts it update the local copy. The screen never shows something the server doesn't have.
//
// Unlocking loads the whole vault. After that, coming back to the tab fetches only what changed
// on other devices (see sync.ts), so edits made on a phone show up without reloading.

interface VaultStore {
  /** null while loading. */
  entries: VaultEntry[] | null;
  loadError: string | null;
  /** Fetches changes made elsewhere. Also the "Reload" after an edit conflict. */
  reload(): Promise<void>;
  create(item: VaultItem): Promise<string>;
  update(entry: VaultEntry, item: VaultItem): Promise<void>;
  trash(entry: VaultEntry): Promise<void>;
  restore(entry: VaultEntry): Promise<void>;
  remove(entry: VaultEntry): Promise<void>;
}

const VaultContext = createContext<VaultStore | null>(null);

export function VaultProvider({ vaultKey, children }: { vaultKey: CryptoKey; children: ReactNode }) {
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The vault version the local copy has reached. 0 means nothing loaded yet.
  const syncedVersion = useRef(0);
  const hasLoaded = useRef(false);
  // Syncs run one after another, never side by side. A "Reload" pressed during a sync must
  // wait for a fresh one: the running sync may have started before the change it's meant to fetch.
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  // Items deleted forever on this device. A sync that started before the delete still carries
  // them, and without this they'd briefly reappear.
  const removedHere = useRef(new Set<string>());

  const syncOnce = useCallback(async () => {
    try {
      const changes = await fetchChangesSince(api, syncedVersion.current);
      const synced = await Promise.all(changes.items.map((row) => decryptRow(vaultKey, row)));
      const deletedIds = [...changes.deletedIds, ...removedHere.current];
      setEntries((current) => mergeSyncedEntries(current, synced, deletedIds, changes.replacesAll));
      syncedVersion.current = changes.version;
      hasLoaded.current = true;
      setLoadError(null);
    } catch {
      // A failed refresh in the background keeps the vault on screen; it tries again next time.
      if (!hasLoaded.current) setLoadError("Couldn't load your vault. Check your connection and try again.");
    }
  }, [vaultKey]);

  const reload = useCallback(() => {
    syncQueue.current = syncQueue.current.then(syncOnce);
    return syncQueue.current;
  }, [syncOnce]);

  useEffect(() => {
    void reload();
    function onVisible() {
      if (document.visibilityState === "visible") void reload();
    }
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  /** Adds or replaces one entry in the local copy. */
  function save(entry: VaultEntry) {
    setEntries((prev) => [...(prev ?? []).filter((e) => e.id !== entry.id), entry]);
  }

  const store: VaultStore = {
    entries,
    loadError,
    reload,

    async create(item) {
      const id = newItemId();
      const row = await api.createItem({ id, data: await encryptItem(vaultKey, id, item) });
      save(toEntry(row, item));
      return id;
    },

    async update(entry, item) {
      const data = await encryptItem(vaultKey, entry.id, item);
      const row = await api.updateItem(entry.id, { data, revision: entry.revision });
      save(toEntry(row, item));
    },

    async trash(entry) {
      save(toEntry(await api.trashItem(entry.id), entry.item));
    },

    async restore(entry) {
      save(toEntry(await api.restoreItem(entry.id), entry.item));
    },

    async remove(entry) {
      await api.deleteItem(entry.id);
      removedHere.current.add(entry.id);
      setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
    },
  };

  return <VaultContext.Provider value={store}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const value = useContext(VaultContext);
  if (!value) throw new Error("useVault must be used inside <VaultProvider>");
  return value;
}

async function decryptRow(vaultKey: CryptoKey, row: VaultItemResponse): Promise<VaultEntry> {
  try {
    return toEntry(row, await decryptItem(vaultKey, row.id, row.data));
  } catch {
    return toEntry(row, null);
  }
}

function toEntry(row: VaultItemResponse, item: VaultItem | null): VaultEntry {
  return {
    id: row.id,
    revision: row.revision,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    size: storedSize(row.data),
    item,
  };
}
