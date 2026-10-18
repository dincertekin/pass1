import {
  createItemRequestSchema,
  PLANS,
  storedSize,
  updateItemRequestSchema,
  type ListItemsResponse,
  type VaultItemResponse,
} from "@pass1/shared";
import { and, count, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { requireUser } from "../auth/sessions.js";
import type { Db } from "../db/client.js";
import { vaultItems, type User, type VaultItemRow } from "../db/schema.js";
import { ApiError, parseBody } from "../errors.js";

// CRUD for encrypted vault items. Every query is filtered by the logged-in user's ID,
// so one user can never read or change another user's items, even by guessing an ID.

const idParamsSchema = z.object({ id: z.uuid() });

export function vaultRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  app.get("/vault/items", async (request): Promise<ListItemsResponse> => {
    const user = requireUser(db, config, request);
    const rows = db.select().from(vaultItems).where(eq(vaultItems.userId, user.id)).all();
    return { items: rows.map(toItemResponse) };
  });

  app.post("/vault/items", async (request, reply) => {
    const user = requireUser(db, config, request);
    const body = parseBody(createItemRequestSchema, request.body);
    const size = storedSize(body.data);

    const row = db.transaction((tx) => {
      if (tx.select({ id: vaultItems.id }).from(vaultItems).where(eq(vaultItems.id, body.id)).get()) {
        throw new ApiError(409, "CONFLICT", "An item with this ID already exists.");
      }
      assertWithinLimits(tx, user, { addItems: 1, addBytes: size });
      const now = new Date();
      return tx
        .insert(vaultItems)
        .values({ id: body.id, userId: user.id, data: body.data, size, createdAt: now, updatedAt: now })
        .returning()
        .get();
    });

    return reply.status(201).send(toItemResponse(row));
  });

  app.put("/vault/items/:id", async (request): Promise<VaultItemResponse> => {
    const user = requireUser(db, config, request);
    const { id } = parseBody(idParamsSchema, request.params);
    const body = parseBody(updateItemRequestSchema, request.body);
    const size = storedSize(body.data);

    const row = db.transaction((tx) => {
      const existing = findItem(tx, user, id);
      if (existing.revision !== body.revision) {
        throw new ApiError(409, "CONFLICT", "This item was changed somewhere else. Reload to see the latest version.");
      }
      // Only growth counts, so an account over its limit can still shrink or fix items.
      assertWithinLimits(tx, user, { addItems: 0, addBytes: size - existing.size });
      return tx
        .update(vaultItems)
        .set({ data: body.data, size, revision: existing.revision + 1, updatedAt: new Date() })
        .where(eq(vaultItems.id, id))
        .returning()
        .get();
    });

    return toItemResponse(row);
  });

  app.post("/vault/items/:id/trash", async (request): Promise<VaultItemResponse> => {
    return setTrashed(request, true);
  });

  app.post("/vault/items/:id/restore", async (request): Promise<VaultItemResponse> => {
    return setTrashed(request, false);
  });

  /** Permanent. The web app only offers this for items already in the trash. */
  app.delete("/vault/items/:id", async (request, reply) => {
    const user = requireUser(db, config, request);
    const { id } = parseBody(idParamsSchema, request.params);
    findItem(db, user, id);
    db.delete(vaultItems).where(eq(vaultItems.id, id)).run();
    return reply.status(204).send();
  });

  function setTrashed(request: FastifyRequest, trashed: boolean) {
    const user = requireUser(db, config, request);
    const { id } = parseBody(idParamsSchema, request.params);
    const existing = findItem(db, user, id);
    const now = new Date();
    const row = db
      .update(vaultItems)
      .set({ deletedAt: trashed ? now : null, revision: existing.revision + 1, updatedAt: now })
      .where(eq(vaultItems.id, id))
      .returning()
      .get();
    return toItemResponse(row!);
  }
}

// `tx` is either the database or a transaction; both have the same query methods.
type Queryable = Pick<Db, "select">;

/** Finds one of the user's items, or throws 404. Another user's item also gives 404. */
function findItem(tx: Queryable, user: User, id: string): VaultItemRow {
  const row = tx
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, user.id)))
    .get();
  if (!row) throw new ApiError(404, "NOT_FOUND", "Item not found.");
  return row;
}

/** Items in the trash still count: they're still stored. */
function assertWithinLimits(tx: Queryable, user: User, change: { addItems: number; addBytes: number }) {
  const { limits } = PLANS[user.plan];
  const usage = tx
    .select({ items: count(), bytes: sql<number>`coalesce(sum(${vaultItems.size}), 0)` })
    .from(vaultItems)
    .where(eq(vaultItems.userId, user.id))
    .get()!;

  if (change.addItems > 0 && limits.maxItems !== null && usage.items + change.addItems > limits.maxItems) {
    throw new ApiError(403, "PLAN_LIMIT_REACHED", `Your plan holds up to ${limits.maxItems} items.`);
  }
  if (change.addBytes > 0 && usage.bytes + change.addBytes > limits.maxStorageBytes) {
    const mb = Math.round(limits.maxStorageBytes / (1024 * 1024));
    throw new ApiError(403, "PLAN_LIMIT_REACHED", `Your plan holds up to ${mb} MB.`);
  }
}

function toItemResponse(row: VaultItemRow): VaultItemResponse {
  return {
    id: row.id,
    revision: row.revision,
    data: row.data,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    deletedAt: row.deletedAt?.getTime() ?? null,
  };
}
