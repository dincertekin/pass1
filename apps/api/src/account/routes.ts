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

// Routes that change the account itself. Anything destructive asks for the master password
// again (as an auth key), so a stolen or forgotten-open session isn't enough.

// Each attempt checks a password, so these are limited like login.
const PASSWORD_CHECK_LIMIT = { max: 5, timeWindow: 60 * 1000 };

export function accountRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  /**
   * New master password. The browser re-encrypts the vault key with the new password and sends
   * the result; items don't change. Every other session is ended, so a device that knew the
   * old password (or a stolen session) is logged out.
   */
  app.post("/account/password", { config: { rateLimit: PASSWORD_CHECK_LIMIT } }, async (request): Promise<AccountResponse> => {
    const { user, sessionId } = authenticate(db, config, request);
    const body = parseBody(changePasswordRequestSchema, request.body);
    await assertAuthKey(user, body.currentAuthKey, "Current master password is incorrect.");

    const newAuthHash = await hashAuthKey(body.newAuthKey);
    const updated = db.transaction((tx) => {
      tx.delete(sessions)
        .where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId)))
        .run();
      return tx
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
        .returning()
        .get();
    });

    return toAccountResponse(updated!);
  });

  app.get("/account/sessions", async (request): Promise<ListSessionsResponse> => {
    const { user, sessionId } = authenticate(db, config, request);
    const rows = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastUsedAt))
      .all();

    return {
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.getTime(),
        lastUsedAt: (row.lastUsedAt ?? row.createdAt).getTime(),
        userAgent: row.userAgent,
        current: row.id === sessionId,
      })),
    };
  });

  /** Logs out one device. Ending the current session also clears this browser's cookie. */
  app.delete("/account/sessions/:id", async (request, reply) => {
    const { user, sessionId } = authenticate(db, config, request);
    const { id } = parseBody(z.object({ id: z.string() }), request.params);

    const deleted = db
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
      .returning({ id: sessions.id })
      .all();
    if (deleted.length === 0) throw new ApiError(404, "NOT_FOUND", "Session not found.");

    if (id === sessionId) clearSessionCookie(config, reply);
    return reply.status(204).send();
  });

  app.post("/account/sessions/revoke-others", async (request, reply) => {
    const { user, sessionId } = authenticate(db, config, request);
    db.delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId)))
      .run();
    return reply.status(204).send();
  });

  /** Deletes the user. Their sessions and vault items go with them (ON DELETE CASCADE). */
  app.delete("/account", { config: { rateLimit: PASSWORD_CHECK_LIMIT } }, async (request, reply) => {
    const { user } = authenticate(db, config, request);
    const { authKey } = parseBody(deleteAccountRequestSchema, request.body);
    await assertAuthKey(user, authKey, "Master password is incorrect.");

    db.delete(users).where(eq(users.id, user.id)).run();
    clearSessionCookie(config, reply);
    return reply.status(204).send();
  });
}

async function assertAuthKey(user: User, authKey: string, message: string) {
  if (!(await verifyAuthKey(user.authHash, authKey))) {
    throw new ApiError(403, "INVALID_CREDENTIALS", message);
  }
}
