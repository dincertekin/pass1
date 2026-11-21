import { z } from "zod";
import { encryptedBlobSchema, type EncryptedBlob } from "./crypto";

// Request and response bodies for /vault/items. The server only ever sees `data` as ciphertext.

export const createItemRequestSchema = z.object({
  // Created in the browser before encryption, because the ID is bound into the ciphertext.
  id: z.uuid(),
  data: encryptedBlobSchema,
});
export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;

export const updateItemRequestSchema = z.object({
  data: encryptedBlobSchema,
  // The revision this edit is based on. If the item changed since (another tab, another
  // device), the server answers 409 instead of silently overwriting the newer version.
  revision: z.int().min(1),
});
export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;

export const vaultItemResponseSchema = z.object({
  id: z.uuid(),
  revision: z.int().min(1),
  data: encryptedBlobSchema,
  /** Milliseconds since 1970, like Date.now(). */
  createdAt: z.int(),
  updatedAt: z.int(),
  /** Set when the item is in the trash. */
  deletedAt: z.int().nullable(),
});
export type VaultItemResponse = z.infer<typeof vaultItemResponseSchema>;

/**
 * Most items in one page of GET /vault/items. Items are at most 64 KiB and usually under 1 KiB,
 * so a page stays small enough for a phone on a slow network.
 */
export const SYNC_PAGE_SIZE = 500;

/**
 * GET /vault/items?since=N asks for every change after vault version N.
 * Leaving it out (or 0) asks for the whole vault.
 */
export const listItemsQuerySchema = z.object({
  // Capped at the largest Postgres integer, which is what versions are stored as.
  since: z.coerce.number().int().min(0).max(2_147_483_647).default(0),
});
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export const listItemsResponseSchema = z.object({
  /** Items created or changed after `since`, the trash included. */
  items: z.array(vaultItemResponseSchema),
  /** Items deleted forever after `since`. Remove them from the local copy. */
  deletedIds: z.array(z.uuid()),
  /** The vault version this response brings you up to. Send it as `since` next time. */
  version: z.int().min(0),
  /** More changes are waiting: ask again right away with `since` = `version`. */
  hasMore: z.boolean(),
  /**
   * This response starts from an empty vault: throw away the local copy before applying it.
   * True for a full sync, and also when `since` is ahead of the server, which happens after
   * the server is restored from a backup. Without this, that device would miss every change.
   */
  replacesAll: z.boolean(),
});
export type ListItemsResponse = z.infer<typeof listItemsResponseSchema>;

/**
 * How many bytes an item counts against the plan's storage limit: the decoded ciphertext size.
 * The API uses it to enforce limits and the web app uses it for the usage meter.
 */
export function storedSize(blob: EncryptedBlob): number {
  const padding = blob.ciphertext.endsWith("==") ? 2 : blob.ciphertext.endsWith("=") ? 1 : 0;
  return (blob.ciphertext.length / 4) * 3 - padding;
}
