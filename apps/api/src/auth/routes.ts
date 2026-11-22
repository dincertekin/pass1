import {
  checkSignupRequestSchema,
  loginRequestSchema,
  preloginRequestSchema,
  registerRequestSchema,
  signupRequestSchema,
  type AccountResponse,
  type AppSession,
  type ChallengeResponse,
  type CheckSignupResponse,
  type PreloginResponse,
} from "@pass1/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHmac } from "node:crypto";
import type { RouteDeps } from "../app.js";
import { users, type User } from "../db/schema.js";
import { ApiError, parseBody } from "../errors.js";
import { loginFailureRule, rateLimits } from "../rate-limits.js";
import { LoginThrottle } from "./login-throttle.js";
import { hashAuthKey, verifyAgainstDummy, verifyAuthKey } from "./password.js";
import { checkProofOfWork, createChallenge, PROOF_OF_WORK_RESULT, type ProofOfWorkResult } from "./proof-of-work.js";
import { endSession, requireUser, startSession } from "./sessions.js";
import { findSignupEmail, requestSignup, SIGNUP_LINK_INVALID_MESSAGE, useSignupToken } from "./signup.js";

// Same as DEFAULT_KDF_PARAMS in @pass1/crypto. Shown to unknown emails at prelogin,
// so they look exactly like a freshly registered account.
const DEFAULT_KDF_PARAMS = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 };

export function authRoutes(app: FastifyInstance, deps: RouteDeps) {
  const { db, config } = deps;
  const limits = rateLimits(config);
  const throttle = new LoginThrottle(loginFailureRule(config));

  /**
   * Step 1 of login: the browser needs the user's salt and KDF settings before it can derive
   * the auth key. Unknown emails get a fake salt computed from the email and a server secret,
   * so it's the same every time and the response can't reveal whether an account exists.
   */
  app.post("/auth/prelogin", { config: { rateLimit: limits.prelogin } }, async (request): Promise<PreloginResponse> => {
    const { email } = parseBody(preloginRequestSchema, request.body);
    const user = await findUserByEmail(email);
    if (!user) {
      return { kdfSalt: fakeSalt(email), kdfParams: DEFAULT_KDF_PARAMS };
    }
    return { kdfSalt: user.kdfSalt, kdfParams: kdfParamsOf(user) };
  });

  /** A sign-up puzzle for the browser to solve (see auth/proof-of-work.ts). */
  app.get("/auth/challenge", { config: { rateLimit: limits.challenge } }, async (): Promise<ChallengeResponse> => {
    return createChallenge(config);
  });

  /** Step 1 of creating an account (see auth/signup.ts). Same answer for every email. */
  app.post("/auth/signup", { config: { rateLimit: limits.signup } }, async (request, reply) => {
    const { email, proofOfWork } = parseBody(signupRequestSchema, request.body);
    const proofResult = await checkProofOfWork(config, db, proofOfWork);
    if (proofResult !== PROOF_OF_WORK_RESULT.OK) {
      throw new ApiError(403, "PROOF_OF_WORK_FAILED", proofOfWorkMessage(proofResult));
    }
    await requestSignup(deps, email);
    return reply.status(202).send();
  });

  /** Which email a sign-up link is for, so the page can show it before the master password is chosen. */
  app.post("/auth/signup/check", { config: { rateLimit: limits.prelogin } }, async (request): Promise<CheckSignupResponse> => {
    const { signupToken } = parseBody(checkSignupRequestSchema, request.body);
    const email = await findSignupEmail(db, signupToken);
    if (!email) throw new ApiError(400, "SIGNUP_LINK_INVALID", SIGNUP_LINK_INVALID_MESSAGE);
    return { email };
  });

  /** Step 2: the page the sign-up link opens sends the token with the newly derived keys. */
  app.post("/auth/register", { config: { rateLimit: limits.register } }, async (request, reply) => {
    const body = parseBody(registerRequestSchema, request.body);
    refuseAppSessionFromBrowser(request, body.appSession);

    // A cheap check before the expensive Argon2 hash. The token is only used up further down.
    const email = await findSignupEmail(db, body.signupToken);
    if (!email) throw new ApiError(400, "SIGNUP_LINK_INVALID", SIGNUP_LINK_INVALID_MESSAGE);

    const user: User = {
      id: crypto.randomUUID(),
      email,
      authHash: await hashAuthKey(body.authKey),
      kdfSalt: body.kdfSalt,
      kdfMemoryKiB: body.kdfParams.memoryKiB,
      kdfIterations: body.kdfParams.iterations,
      kdfParallelism: body.kdfParams.parallelism,
      wrappedVaultKey: body.wrappedVaultKey,
      plan: "free",
      vaultVersion: 0,
      createdAt: new Date(),
    };

    try {
      await db.transaction(async (tx) => {
        if (!(await useSignupToken(tx, body.signupToken))) {
          throw new ApiError(400, "SIGNUP_LINK_INVALID", SIGNUP_LINK_INVALID_MESSAGE);
        }
        await tx.insert(users).values(user);
      });
    } catch (err) {
      // Two links for the same email, both opened: the unique index catches the second account.
      // Only the owner of the inbox can get here, so saying so reveals nothing new.
      if (isUniqueViolation(err)) throw new ApiError(409, "EMAIL_TAKEN", "This email already has an account. Log in instead.");
      throw err;
    }

    const sessionToken = await startSession(db, config, request, reply, user.id, body.appSession);
    return reply.status(201).send(withSessionToken(toAccountResponse(user), sessionToken));
  });

  app.post("/auth/login", { config: { rateLimit: limits.login } }, async (request, reply): Promise<AccountResponse> => {
    const { email, authKey, appSession } = parseBody(loginRequestSchema, request.body);
    refuseAppSessionFromBrowser(request, appSession);

    // Checked before anything else, and for unknown emails too (see auth/login-throttle.ts).
    const wait = throttle.retryAfter(email);
    if (wait > 0) {
      const minutes = Math.ceil(wait / 60_000);
      reply.header("retry-after", Math.ceil(wait / 1000));
      throw new ApiError(429, "RATE_LIMITED", `Too many failed attempts for this account. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
    }

    const user = await findUserByEmail(email);
    if (!user) {
      await verifyAgainstDummy(authKey);
      throttle.recordFailure(email);
      throw invalidCredentials();
    }
    if (!(await verifyAuthKey(user.authHash, authKey))) {
      throttle.recordFailure(email);
      throw invalidCredentials();
    }

    throttle.recordSuccess(email);
    const sessionToken = await startSession(db, config, request, reply, user.id, appSession);
    return withSessionToken(toAccountResponse(user), sessionToken);
  });

  app.post("/auth/logout", async (request, reply) => {
    await endSession(db, config, request, reply);
    return reply.status(204).send();
  });

  /** After a page reload the session cookie is still there but the keys are gone. This gives the browser what it needs to unlock again. */
  app.get("/auth/me", async (request): Promise<AccountResponse> => {
    return toAccountResponse(await requireUser(db, config, request));
  });

  async function findUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  function fakeSalt(email: string) {
    return createHmac("sha256", config.PRELOGIN_SECRET).update(email).digest().subarray(0, 16).toString("base64");
  }
}

// One message for both cases, so it doesn't reveal whether the email exists.
function invalidCredentials() {
  return new ApiError(401, "INVALID_CREDENTIALS", "Email or master password is incorrect.");
}

function kdfParamsOf(user: User) {
  return { memoryKiB: user.kdfMemoryKiB, iterations: user.kdfIterations, parallelism: user.kdfParallelism };
}

export function toAccountResponse(user: User): AccountResponse {
  return {
    user: { id: user.id, email: user.email, plan: user.plan },
    kdfSalt: user.kdfSalt,
    kdfParams: kdfParamsOf(user),
    wrappedVaultKey: user.wrappedVaultKey,
  };
}

function isUniqueViolation(err: unknown): boolean {
  // Drizzle wraps the driver's error, so check the cause too.
  const codeOf = (e: unknown) => (e as { code?: unknown } | undefined)?.code;
  // 23505 is Postgres's code for unique_violation.
  return [err, (err as { cause?: unknown })?.cause].some((e) => codeOf(e) === "23505");
}

/** What the person sees when the sign-up check fails. Input: a result other than OK. */
function proofOfWorkMessage(result: ProofOfWorkResult): string {
  if (result === PROOF_OF_WORK_RESULT.EXPIRED) return "The sign-up check took too long. Try again.";
  return "The sign-up check failed. Reload the page and try again.";
}

/**
 * Browsers get a cookie, never a bearer token: a token could be copied out of the page by
 * injected script, and a cookie can't. Browsers always send an Origin header here and can't
 * remove it, so an app session asked for with one is refused.
 */
function refuseAppSessionFromBrowser(request: FastifyRequest, appSession: AppSession | undefined) {
  if (appSession && request.headers.origin !== undefined) {
    throw new ApiError(400, "VALIDATION_FAILED", "App sessions can't be started from a browser.");
  }
}

/** Input: an account response and an app's token (or null). Output: the response, with the token if there is one. */
function withSessionToken(response: AccountResponse, sessionToken: string | null): AccountResponse {
  return sessionToken ? { ...response, sessionToken } : response;
}
