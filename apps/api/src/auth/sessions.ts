import { and, eq, gt, lte } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { sessions, users, type User } from "../db/schema.js";
import { ApiError } from "../errors.js";

// A session is a random token in an httpOnly cookie. The database stores only its SHA-256,
// so someone who reads the database can't use it to log in as anyone.

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function sessionCookieName(config: Config) {
  // The __Host- prefix makes the browser refuse the cookie unless it's Secure, has path=/ and
  // no Domain, so a subdomain can't set or overwrite it. It needs HTTPS, so not in development.
  return config.NODE_ENV === "production" ? "__Host-pass1_session" : "pass1_session";
}

export function startSession(db: Db, config: Config, reply: FastifyReply, userId: string) {
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  // Tidy up this user's expired sessions while we're here, so the table doesn't grow forever.
  db.delete(sessions).where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, now))).run();
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();

  reply.setCookie(sessionCookieName(config), token, {
    path: "/",
    httpOnly: true, // JavaScript can't read it, so an XSS bug can't steal it.
    secure: config.NODE_ENV === "production",
    sameSite: "strict", // Not sent on requests started by other sites.
    expires: expiresAt,
  });
}

export function endSession(db: Db, config: Config, request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[sessionCookieName(config)];
  if (token) db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
  reply.clearCookie(sessionCookieName(config), { path: "/" });
}

/** Returns the logged-in user, or throws 401. Use at the top of every route that needs a user. */
export function requireUser(db: Db, config: Config, request: FastifyRequest): User {
  const token = request.cookies[sessionCookieName(config)];
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Log in to continue.");

  const row = db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .get();

  if (!row) throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired. Log in again.");
  return row.user;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
