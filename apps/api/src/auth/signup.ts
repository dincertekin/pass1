// Creating an account starts with the email, so the sign-up page never reveals who has an account.
//
// Step 1, POST /auth/signup: always answers "check your inbox". A new email gets a link to
// choose the master password; an email that already has an account gets a note saying so.
// Step 2, POST /auth/register: the page the link opens sends the token with the new keys.
//
// The token travels after "#" in the link (/register#token=...). Browsers never send that part
// to the server, so it can't end up in request logs or a proxy's logs.

import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, lt } from "drizzle-orm";
import type { RouteDeps } from "../app.js";
import type { Db } from "../db/client.js";
import { signupRequests, users } from "../db/schema.js";
import { ApiError } from "../errors.js";

// Long enough to switch to the inbox and back, even with a slow mail server.
const SIGNUP_LINK_LIFETIME_MS = 60 * 60 * 1000;
// Three emails an hour per address is plenty for someone who mistyped or lost one, and too
// few for anyone to flood a stranger's inbox through pass1.
const MAX_SIGNUP_EMAILS_PER_HOUR = 3;
const ONE_HOUR_MS = 60 * 60 * 1000;
const TOKEN_BYTES = 32;

/**
 * Sends the right sign-up email for this address, unless it has had too many this hour.
 * Input: deps, an email and the current time. Output: nothing; the caller answers the same either way.
 * Throws EMAIL_NOT_SENT if the mail server refused, so the person knows to try again.
 */
export async function requestSignup(deps: RouteDeps, email: string, nowMs = Date.now()): Promise<void> {
  const { db, config, sendEmail } = deps;
  const oneHourAgo = new Date(nowMs - ONE_HOUR_MS);
  const [recent] = await db
    .select({ emails: count() })
    .from(signupRequests)
    .where(and(eq(signupRequests.email, email), gt(signupRequests.createdAt, oneHourAgo)));
  // Silently: saying "too many emails" would reveal that someone asked before.
  if (recent!.emails >= MAX_SIGNUP_EMAILS_PER_HOUR) return;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  const token = existing ? null : randomBytes(TOKEN_BYTES).toString("base64url");
  await db.insert(signupRequests).values({
    id: crypto.randomUUID(),
    email,
    tokenHash: token ? hashToken(token) : null,
    expiresAt: new Date(nowMs + SIGNUP_LINK_LIFETIME_MS),
    createdAt: new Date(nowMs),
  });

  const message = token ? newAccountEmail(config.WEB_ORIGIN, token) : existingAccountEmail(config.WEB_ORIGIN);
  try {
    await sendEmail({ to: email, ...message });
  } catch {
    throw new ApiError(503, "EMAIL_NOT_SENT", "The email couldn't be sent. Try again in a few minutes.");
  }
}

/** Input: a token from a sign-up link. Output: the email it's for, or null if it's unknown, used or expired. */
export async function findSignupEmail(db: Db, token: string, nowMs = Date.now()): Promise<string | null> {
  const [row] = await db
    .select({ email: signupRequests.email })
    .from(signupRequests)
    .where(and(eq(signupRequests.tokenHash, hashToken(token)), gt(signupRequests.expiresAt, new Date(nowMs))));
  return row?.email ?? null;
}

/**
 * Uses up a sign-up token. Call it inside the transaction that creates the account.
 * Input: a transaction and the token. Output: the email it was for, or null if it's no longer valid.
 * One statement, so two requests racing with the same link can't both create an account.
 */
export async function useSignupToken(tx: Pick<Db, "delete">, token: string, nowMs = Date.now()): Promise<string | null> {
  const [row] = await tx
    .delete(signupRequests)
    .where(and(eq(signupRequests.tokenHash, hashToken(token)), gt(signupRequests.expiresAt, new Date(nowMs))))
    .returning({ email: signupRequests.email });
  return row?.email ?? null;
}

/** Removes sign-up requests older than an hour, so emails of people who never finished don't pile up. */
export async function deleteExpiredSignupRequests(db: Db, nowMs = Date.now()): Promise<number> {
  const deleted = await db
    .delete(signupRequests)
    .where(lt(signupRequests.expiresAt, new Date(nowMs)))
    .returning({ id: signupRequests.id });
  return deleted.length;
}

export const SIGNUP_LINK_INVALID_MESSAGE = "This sign-up link has expired or was already used. Start again to get a new one.";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newAccountEmail(webOrigin: string, token: string) {
  return {
    subject: "Finish creating your pass1 account",
    text: [
      "Open this link to choose your master password and create your vault:",
      "",
      `${webOrigin}/register#token=${token}`,
      "",
      "The link works once, within the next hour.",
      "",
      "If you didn't ask for a pass1 account, ignore this email. Nothing is created unless the link is opened.",
    ].join("\n"),
  };
}

function existingAccountEmail(webOrigin: string) {
  return {
    subject: "You already have a pass1 account",
    text: [
      "Someone asked to create a pass1 account with this email, but it already has one.",
      "",
      `Log in here: ${webOrigin}/login`,
      "",
      "If that wasn't you, there's nothing to do. Your account and vault are unchanged.",
      "",
      "Forgot your master password? pass1 can't reset it, because the server never knew it.",
    ].join("\n"),
  };
}
