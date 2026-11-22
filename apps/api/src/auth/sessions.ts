import type { AppSession } from "@pass1/shared";
import { and, eq, gt, lte } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import type { Config } from "../config.js";
import type { Db } from "../db/client.js";
import { sessions, users, type User } from "../db/schema.js";
import { ApiError } from "../errors.js";

// A session is a random token: in an httpOnly cookie for the web, or a bearer token in the
// Authorization header for apps. The database stores only its SHA-256, so someone who reads
// the database can't use it to log in as anyone.
//
// Each session only works the way it was created. A browser can never be handed a bearer token
// (auth/routes.ts refuses app sessions from anything that sends an Origin header), so even
// script injected into the web page can't obtain a token to use somewhere else.

const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
// Apps keep their token in the Keychain or Keystore, and unlocking happens on the device with
// the master password. Logging in again every two weeks on a phone would be friction for nothing.
const APP_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const BEARER_PREFIX = "Bearer ";
// "Last used" is only rewritten when it's this stale, so most requests don't write to the database.
const LAST_USED_PRECISION_MS = 5 * 60 * 1000;
const MAX_USER_AGENT_LENGTH = 300;

export function sessionCookieName(config: Config) {
  // The __Host- prefix makes the browser refuse the cookie unless it's Secure, has path=/ and
  // no Domain, so a subdomain can't set or overwrite it. It needs HTTPS, so not in development.
  return config.NODE_ENV === "production" ? "__Host-pass1_session" : "pass1_session";
}

/**
 * Starts a session after a successful login or registration.
 * Input: the request and reply, the user, and `appSession` when an app asked for a token.
 * Output: the bearer token for an app, or null for the web (which gets a cookie instead).
 */
export async function startSession(
  db: Db,
  config: Config,
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  appSession?: AppSession,
): Promise<string | null> {
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + (appSession ? APP_SESSION_TTL_MS : SESSION_TTL_MS));
  const userAgent = request.headers["user-agent"]?.slice(0, MAX_USER_AGENT_LENGTH) ?? null;

  // Tidy up this user's expired sessions while we're here, so the table doesn't grow forever.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lte(sessions.expiresAt, now)));
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent,
    deviceName: appSession?.deviceName ?? null,
    transport: appSession ? "token" : "cookie",
    lastUsedAt: now,
  });
  if (appSession) return token;

  reply.setCookie(sessionCookieName(config), token, {
    path: "/",
    httpOnly: true, // JavaScript can't read it, so an XSS bug can't steal it.
    secure: config.NODE_ENV === "production",
    sameSite: "strict", // Not sent on requests started by other sites.
    expires: expiresAt,
  });
  return null;
}

/**
 * Finds the session token a request carries. Output: the token and how it came, or null.
 * An Authorization header wins over a cookie, so an app's request is never judged by a cookie.
 */
function readSessionToken(config: Config, request: FastifyRequest): { token: string; transport: "cookie" | "token" } | null {
  const header = request.headers.authorization;
  if (header?.startsWith(BEARER_PREFIX)) return { token: header.slice(BEARER_PREFIX.length), transport: "token" };
  const cookie = request.cookies[sessionCookieName(config)];
  return cookie ? { token: cookie, transport: "cookie" } : null;
}

export async function endSession(db: Db, config: Config, request: FastifyRequest, reply: FastifyReply) {
  const found = readSessionToken(config, request);
  if (found) await db.delete(sessions).where(and(eq(sessions.id, hashToken(found.token)), eq(sessions.transport, found.transport)));
  if (found?.transport !== "token") clearSessionCookie(config, reply);
}

export function clearSessionCookie(config: Config, reply: FastifyReply) {
  reply.clearCookie(sessionCookieName(config), { path: "/" });
}

/**
 * Returns the logged-in user and their session's ID, or throws 401.
 * Use at the top of every route that needs a user.
 */
export async function authenticate(
  db: Db,
  config: Config,
  request: FastifyRequest,
): Promise<{ user: User; sessionId: string }> {
  const found = readSessionToken(config, request);
  if (!found) throw new ApiError(401, "UNAUTHENTICATED", "Log in to continue.");

  const now = new Date();
  const sessionId = hashToken(found.token);
  const [row] = await db
    .select({ user: users, lastUsedAt: sessions.lastUsedAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.transport, found.transport), gt(sessions.expiresAt, now)));

  if (!row) throw new ApiError(401, "UNAUTHENTICATED", "Your session has expired. Log in again.");

  if (now.getTime() - row.lastUsedAt.getTime() > LAST_USED_PRECISION_MS) {
    await db.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, sessionId));
  }
  return { user: row.user, sessionId };
}

/**
 * Deletes every expired session. Logging in tidies up that user's own, but sessions of people
 * who never come back would otherwise stay forever. server.ts runs this once an hour.
 */
export async function deleteExpiredSessions(db: Db, now = new Date()): Promise<number> {
  const deleted = await db.delete(sessions).where(lte(sessions.expiresAt, now)).returning({ id: sessions.id });
  return deleted.length;
}

/** Shorthand for routes that only need the user. */
export async function requireUser(db: Db, config: Config, request: FastifyRequest): Promise<User> {
  return (await authenticate(db, config, request)).user;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
