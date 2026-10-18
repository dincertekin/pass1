import { createExport, decryptItem, encryptItem, newItemId, openExport, type VaultItem } from "@pass1/crypto";
import { exportFileSchema } from "@pass1/shared";
import { api, ApiRequestError } from "./api";

// Export: decrypt every item here, then encrypt them all into one file with the export password.
// Import: the reverse, re-encrypting each item with this vault's key under a new ID.

/** Builds an encrypted export of all items not in the trash, and offers it as a download. */
export async function exportVault(vaultKey: CryptoKey, password: string): Promise<number> {
  const { items: rows } = await api.listItems();
  const items: VaultItem[] = [];
  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    items.push(await decryptItem(vaultKey, row.id, row.data));
  }

  const file = await createExport(items, password);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pass1-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  return items.length;
}

export class InvalidExportFileError extends Error {
  constructor() {
    super("This isn't a pass1 export file, or it's damaged.");
    this.name = "InvalidExportFileError";
  }
}

export interface ImportResult {
  imported: number;
  total: number;
  /** Set when the import stopped early, e.g. because the plan's limit was reached. */
  stoppedBecause: string | null;
}

/**
 * Adds every item in the file to the vault. Existing items are left alone, so importing the
 * same file twice gives duplicates. Throws DecryptionError for a wrong export password.
 */
export async function importVault(
  vaultKey: CryptoKey,
  fileText: string,
  password: string,
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  let json: unknown;
  try {
    json = JSON.parse(fileText);
  } catch {
    throw new InvalidExportFileError();
  }
  const parsed = exportFileSchema.safeParse(json);
  if (!parsed.success) throw new InvalidExportFileError();

  const items = await openExport(parsed.data, password);
  for (let i = 0; i < items.length; i++) {
    const id = newItemId();
    try {
      await api.createItem({ id, data: await encryptItem(vaultKey, id, items[i]!) });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "PLAN_LIMIT_REACHED") {
        return { imported: i, total: items.length, stoppedBecause: err.message };
      }
      throw err;
    }
    onProgress(i + 1, items.length);
  }
  return { imported: items.length, total: items.length, stoppedBecause: null };
}
