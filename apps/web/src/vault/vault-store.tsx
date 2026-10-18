import { decryptItem, encryptItem, newItemId, type VaultItem } from "@pass1/crypto";
import { storedSize, type VaultItemResponse } from "@pass1/shared";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";

// The decrypted vault, held in memory while it's unlocked. When the vault locks, the screen
// that owns this provider unmounts and the plaintext goes with it.
//
// Every change follows the same order: encrypt, send to the server, and only after the server
// accepts it update the local copy. The screen never shows something the server doesn't have.

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

interface VaultStore {
  /** null while loading. */
  entries: VaultEntry[] | null;
  loadError: string | null;
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

  const reload = useCallback(async () => {
    try {
      const { items } = await api.listItems();
      setEntries(await Promise.all(items.map((row) => decryptRow(vaultKey, row))));
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load your vault. Check your connection and try again.");
    }
  }, [vaultKey]);

  useEffect(() => {
    void reload();
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
