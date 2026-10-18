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
import { users, vaultItems, type User, type VaultItemRow } from "../db/schema.js";
import { ApiError, parseBody } from "../errors.js";

// CRUD for encrypted vault items. Every query is filtered by the logged-in user's ID,
// so one user can never read or change another user's items, even by guessing an ID.

const idParamsSchema = z.object({ id: z.uuid() });

export function vaultRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  app.get("/vault/items", async (request): Promise<ListItemsResponse> => {
    const user = await requireUser(db, config, request);
    const rows = await db.select().from(vaultItems).where(eq(vaultItems.userId, user.id));
    return { items: rows.map(toItemResponse) };
  });

  app.post("/vault/items", async (request, reply) => {
    const user = await requireUser(db, config, request);
    const body = parseBody(createItemRequestSchema, request.body);
    const size = storedSize(body.data);

    const row = await db.transaction(async (tx) => {
      await lockUser(tx, user);
      const [taken] = await tx.select({ id: vaultItems.id }).from(vaultItems).where(eq(vaultItems.id, body.id));
      if (taken) throw new ApiError(409, "CONFLICT", "An item with this ID already exists.");
      await assertWithinLimits(tx, user, { addItems: 1, addBytes: size });

      const now = new Date();
      const [inserted] = await tx
        .insert(vaultItems)
        .values({ id: body.id, userId: user.id, data: body.data, size, createdAt: now, updatedAt: now })
        .returning();
      return inserted!;
    });

    return reply.status(201).send(toItemResponse(row));
  });

  app.put("/vault/items/:id", async (request): Promise<VaultItemResponse> => {
    const user = await requireUser(db, config, request);
    const { id } = parseBody(idParamsSchema, request.params);
    const body = parseBody(updateItemRequestSchema, request.body);
    const size = storedSize(body.data);

    const row = await db.transaction(async (tx) => {
      await lockUser(tx, user);
      const existing = await findItem(tx, user, id);
      if (existing.revision !== body.revision) {
        throw new ApiError(409, "CONFLICT", "This item was changed somewhere else. Reload to see the latest version.");
      }
      // Only growth counts, so an account over its limit can still shrink or fix items.
      await assertWithinLimits(tx, user, { addItems: 0, addBytes: size - existing.size });

      const [updated] = await tx
        .update(vaultItems)
        .set({ data: body.data, size, revision: existing.revision + 1, updatedAt: new Date() })
        .where(eq(vaultItems.id, id))
        .returning();
      return updated!;
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
    const user = await requireUser(db, config, request);
    const { id } = parseBody(idParamsSchema, request.params);
    const deleted = await db
      .delete(vaultItems)
      .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, user.id)))
      .returning({ id: vaultItems.id });
    if (deleted.length === 0) throw new ApiError(404, "NOT_FOUND", "Item not found.");
    return reply.status(204).send();
  });

  async function setTrashed(request: FastifyRequest, trashed: boolean) {
    const user = await requireUser(db, config, request);
    const { id } = parseBody(idParamsSchema, request.params);
    const now = new Date();
    // One statement, so the revision bump can't race with another change.
    const [row] = await db
      .update(vaultItems)
      .set({ deletedAt: trashed ? now : null, revision: sql`${vaultItems.revision} + 1`, updatedAt: now })
      .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, user.id)))
      .returning();
    if (!row) throw new ApiError(404, "NOT_FOUND", "Item not found.");
    return toItemResponse(row);
  }
}

// The database itself, or a transaction: both have the same query methods.
type Queryable = Pick<Db, "select">;

/**
 * Makes this user's writes happen one at a time. Postgres runs transactions side by side,
 * so without this, two saves at the same moment could both pass the plan-limit check, or
 * both pass the revision check and silently overwrite each other. Other users aren't affected.
 */
async function lockUser(tx: Queryable, user: User) {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for("update");
}

/** Finds one of the user's items, or throws 404. Another user's item also gives 404. */
async function findItem(tx: Queryable, user: User, id: string): Promise<VaultItemRow> {
  const [row] = await tx
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, user.id)));
  if (!row) throw new ApiError(404, "NOT_FOUND", "Item not found.");
  return row;
}

/** Items in the trash still count: they're still stored. */
async function assertWithinLimits(tx: Queryable, user: User, change: { addItems: number; addBytes: number }) {
  const { limits } = PLANS[user.plan];
  const [usage] = await tx
    .select({
      items: count(),
      // Postgres returns SUM() as a big-number string, so convert it.
      bytes: sql`coalesce(sum(${vaultItems.size}), 0)`.mapWith(Number),
    })
    .from(vaultItems)
    .where(eq(vaultItems.userId, user.id));

  if (change.addItems > 0 && limits.maxItems !== null && usage!.items + change.addItems > limits.maxItems) {
    throw new ApiError(403, "PLAN_LIMIT_REACHED", `Your plan holds up to ${limits.maxItems} items.`);
  }
  if (change.addBytes > 0 && usage!.bytes + change.addBytes > limits.maxStorageBytes) {
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
