import {
  changePasswordRequestSchema,
  deleteAccountRequestSchema,
  type AccountResponse,
  type ListSessionsResponse,
} from "@pass1/shared";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { hashAuthKey, verifyAuthKey } from "../auth/password.js";
import { toAccountResponse } from "../auth/routes.js";
import { authenticate, clearSessionCookie } from "../auth/sessions.js";
import { sessions, users, type User } from "../db/schema.js";
import { ApiError, parseBody } from "../errors.js";
import { rateLimits } from "../rate-limits.js";

// Routes that change the account itself. Anything destructive asks for the master password
// again (as an auth key), so a stolen or forgotten-open session isn't enough.

export function accountRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  // Each attempt checks a password, so these are limited like login.
  const passwordCheckLimit = rateLimits(config).passwordCheck;

  /**
   * New master password. The browser re-encrypts the vault key with the new password and sends
   * the result; items don't change. Every other session is ended, so a device that knew the
   * old password (or a stolen session) is logged out.
   */
  app.post("/account/password", { config: { rateLimit: passwordCheckLimit } }, async (request): Promise<AccountResponse> => {
    const { user, sessionId } = await authenticate(db, config, request);
    const body = parseBody(changePasswordRequestSchema, request.body);
    await assertAuthKey(user, body.currentAuthKey, "Current master password is incorrect.");

    const newAuthHash = await hashAuthKey(body.newAuthKey);
    const updated = await db.transaction(async (tx) => {
      await tx.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId)));
      const [row] = await tx
        .update(users)
        .set({
          authHash: newAuthHash,
          kdfSalt: body.newKdfSalt,
          kdfMemoryKiB: body.newKdfParams.memoryKiB,
          kdfIterations: body.newKdfParams.iterations,
          kdfParallelism: body.newKdfParams.parallelism,
          wrappedVaultKey: body.newWrappedVaultKey,
        })
        .where(eq(users.id, user.id))
        .returning();
      return row!;
    });

    return toAccountResponse(updated);
  });

  app.get("/account/sessions", async (request): Promise<ListSessionsResponse> => {
    const { user, sessionId } = await authenticate(db, config, request);
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastUsedAt));

    return {
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.getTime(),
        lastUsedAt: row.lastUsedAt.getTime(),
        userAgent: row.userAgent,
        current: row.id === sessionId,
      })),
    };
  });

  /** Logs out one device. Ending the current session also clears this browser's cookie. */
  app.delete("/account/sessions/:id", async (request, reply) => {
    const { user, sessionId } = await authenticate(db, config, request);
    const { id } = parseBody(z.object({ id: z.string() }), request.params);

    const deleted = await db
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
      .returning({ id: sessions.id });
    if (deleted.length === 0) throw new ApiError(404, "NOT_FOUND", "Session not found.");

    if (id === sessionId) clearSessionCookie(config, reply);
    return reply.status(204).send();
  });

  app.post("/account/sessions/revoke-others", async (request, reply) => {
    const { user, sessionId } = await authenticate(db, config, request);
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId)));
    return reply.status(204).send();
  });

  /** Deletes the user. Their sessions and vault items go with them (ON DELETE CASCADE). */
  app.delete("/account", { config: { rateLimit: passwordCheckLimit } }, async (request, reply) => {
    const { user } = await authenticate(db, config, request);
    const { authKey } = parseBody(deleteAccountRequestSchema, request.body);
    await assertAuthKey(user, authKey, "Master password is incorrect.");

    await db.delete(users).where(eq(users.id, user.id));
    clearSessionCookie(config, reply);
    return reply.status(204).send();
  });
}

async function assertAuthKey(user: User, authKey: string, message: string) {
  if (!(await verifyAuthKey(user.authHash, authKey))) {
    throw new ApiError(403, "INVALID_CREDENTIALS", message);
  }
}
