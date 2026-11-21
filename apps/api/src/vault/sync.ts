// Vault versions: how devices ask for "only what changed since I last looked".
//
// Every change to a user's vault (create, edit, trash, restore, delete forever) takes the next
// number from users.vault_version and stamps it on the item, or on a row in vault_deletions.
// Timestamps can't do this job: two saves can share a millisecond, and a transaction that
// started first can commit last, so a device asking "since 12:00:00.000" could miss a change.

import { SYNC_PAGE_SIZE, type ListItemsResponse, type VaultItemResponse } from "@pass1/shared";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users, vaultDeletions, vaultItems, type User, type VaultItemRow } from "../db/schema.js";

// The database itself, or a transaction: both have the same query methods.
type Queryable = Pick<Db, "select" | "update">;

/**
 * Takes the next version number for this user's vault. Call it first inside the write's transaction.
 * Input: a transaction and the user. Output: the new version, e.g. 42.
 *
 * The UPDATE locks the user's row until the transaction ends, which also makes this user's
 * writes happen one at a time. Without that, two saves at the same moment could both pass the
 * plan-limit check, or both pass the revision check and overwrite each other. The lock also
 * means versions become visible in order: version 43 can't commit before 42 does.
 * If the transaction fails, the number is given back, so versions have no gaps from errors.
 */
export async function takeNextVaultVersion(tx: Queryable, user: User): Promise<number> {
  const [row] = await tx
    .update(users)
    .set({ vaultVersion: sql`${users.vaultVersion} + 1` })
    .where(eq(users.id, user.id))
    .returning({ vaultVersion: users.vaultVersion });
  return row!.vaultVersion;
}

/**
 * One page of changes to a user's vault after version `since`, oldest first.
 * Input: since = 0 for the whole vault, or the `version` from the last response.
 * Output: changed items, IDs deleted forever, the version reached, and whether more pages wait.
 *
 * `user` must be freshly loaded for this request: its vaultVersion is the upper bound, so
 * changes committed while this runs wait for the next sync instead of half appearing now.
 */
export async function listChanges(db: Db, user: User, since: number): Promise<ListItemsResponse> {
  const current = user.vaultVersion;
  // A device ahead of the server means the server went back in time (restored from a backup).
  const replacesAll = since === 0 || since > current;
  const from = replacesAll ? 0 : since;

  const rows = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.userId, user.id), gt(vaultItems.changeVersion, from), lte(vaultItems.changeVersion, current)))
    .orderBy(asc(vaultItems.changeVersion))
    .limit(SYNC_PAGE_SIZE);

  // A full page may have more behind it, so this page only reaches its last item's version.
  const isFullPage = rows.length === SYNC_PAGE_SIZE;
  const reached = isFullPage ? rows[rows.length - 1]!.changeVersion : current;

  // After a full sync the device starts empty, so there's nothing for it to delete.
  const deletedIds = replacesAll ? [] : await listDeletedIds(db, user, from, reached);

  return {
    items: rows.map(toItemResponse),
    deletedIds,
    version: reached,
    hasMore: reached < current,
    replacesAll,
  };
}

/** Input: a version range, e.g. after 40 up to 57. Output: IDs of items deleted forever in it. */
async function listDeletedIds(db: Db, user: User, after: number, upTo: number): Promise<string[]> {
  const rows = await db
    .select({ itemId: vaultDeletions.itemId })
    .from(vaultDeletions)
    .where(and(eq(vaultDeletions.userId, user.id), gt(vaultDeletions.changeVersion, after), lte(vaultDeletions.changeVersion, upTo)));
  return rows.map((row) => row.itemId);
}

/** Input: a database row. Output: the item as the API sends it, with times in milliseconds. */
export function toItemResponse(row: VaultItemRow): VaultItemResponse {
  return {
    id: row.id,
    revision: row.revision,
    data: row.data,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    deletedAt: row.deletedAt?.getTime() ?? null,
  };
}
