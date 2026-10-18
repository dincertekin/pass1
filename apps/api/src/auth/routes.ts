import {
  loginRequestSchema,
  preloginRequestSchema,
  registerRequestSchema,
  type AccountResponse,
  type PreloginResponse,
} from "@pass1/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createHmac } from "node:crypto";
import type { AppDeps } from "../app.js";
import { users, type User } from "../db/schema.js";
import { ApiError, parseBody } from "../errors.js";
import { hashAuthKey, verifyAgainstDummy, verifyAuthKey } from "./password.js";
import { endSession, requireUser, startSession } from "./sessions.js";

// Same as DEFAULT_KDF_PARAMS in @pass1/crypto. Shown to unknown emails at prelogin,
// so they look exactly like a freshly registered account.
const DEFAULT_KDF_PARAMS = { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 };

// Per IP address. Every guess also costs the attacker a full Argon2id run in the browser.
const ONE_MINUTE = 60 * 1000;
const limits = {
  prelogin: { max: 30, timeWindow: ONE_MINUTE },
  login: { max: 10, timeWindow: ONE_MINUTE },
  register: { max: 5, timeWindow: 60 * ONE_MINUTE },
};

export function authRoutes(app: FastifyInstance, { db, config }: AppDeps) {
  /**
   * Step 1 of login: the browser needs the user's salt and KDF settings before it can derive
   * the auth key. Unknown emails get a fake salt computed from the email and a server secret,
   * so it's the same every time and the response can't reveal whether an account exists.
   */
  app.post("/auth/prelogin", { config: { rateLimit: limits.prelogin } }, async (request): Promise<PreloginResponse> => {
    const { email } = parseBody(preloginRequestSchema, request.body);
    const user = findUserByEmail(email);
    if (!user) {
      return { kdfSalt: fakeSalt(email), kdfParams: DEFAULT_KDF_PARAMS };
    }
    return { kdfSalt: user.kdfSalt, kdfParams: kdfParamsOf(user) };
  });

  app.post("/auth/register", { config: { rateLimit: limits.register } }, async (request, reply) => {
    const body = parseBody(registerRequestSchema, request.body);

    // This does reveal that an email is registered. Email verification (Phase 8) will fix it:
    // registering will always say "check your inbox", and the email will say what happened.
    if (findUserByEmail(body.email)) {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists.");
    }

    const user: User = {
      id: crypto.randomUUID(),
      email: body.email,
      authHash: await hashAuthKey(body.authKey),
      kdfSalt: body.kdfSalt,
      kdfMemoryKiB: body.kdfParams.memoryKiB,
      kdfIterations: body.kdfParams.iterations,
      kdfParallelism: body.kdfParams.parallelism,
      wrappedVaultKey: body.wrappedVaultKey,
      plan: "free",
      createdAt: new Date(),
    };

    try {
      db.insert(users).values(user).run();
    } catch (err) {
      // Two registrations for the same email at the same moment: the unique index catches the second.
      if (isUniqueViolation(err)) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists.");
      throw err;
    }

    startSession(db, config, request, reply, user.id);
    return reply.status(201).send(toAccountResponse(user));
  });

  app.post("/auth/login", { config: { rateLimit: limits.login } }, async (request, reply): Promise<AccountResponse> => {
    const { email, authKey } = parseBody(loginRequestSchema, request.body);
    const user = findUserByEmail(email);

    if (!user) {
      await verifyAgainstDummy(authKey);
      throw invalidCredentials();
    }
    if (!(await verifyAuthKey(user.authHash, authKey))) {
      throw invalidCredentials();
    }

    startSession(db, config, request, reply, user.id);
    return toAccountResponse(user);
  });

  app.post("/auth/logout", async (request, reply) => {
    endSession(db, config, request, reply);
    return reply.status(204).send();
  });

  /** After a page reload the session cookie is still there but the keys are gone. This gives the browser what it needs to unlock again. */
  app.get("/auth/me", async (request): Promise<AccountResponse> => {
    return toAccountResponse(requireUser(db, config, request));
  });

  function findUserByEmail(email: string) {
    return db.select().from(users).where(eq(users.email, email)).get();
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
  return [err, (err as { cause?: unknown })?.cause].some((e) => codeOf(e) === "SQLITE_CONSTRAINT_UNIQUE");
}
