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

export const listItemsResponseSchema = z.object({
  items: z.array(vaultItemResponseSchema),
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
