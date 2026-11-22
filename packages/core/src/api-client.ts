import {
  accountResponseSchema,
  billingStatusResponseSchema,
  challengeResponseSchema,
  checkSignupResponseSchema,
  errorResponseSchema,
  listItemsResponseSchema,
  listSessionsResponseSchema,
  preloginResponseSchema,
  redirectResponseSchema,
  vaultItemResponseSchema,
  type ChangePasswordRequest,
  type CheckoutRequest,
  type CreateItemRequest,
  type ErrorCode,
  type RegisterRequest,
  type SignupRequest,
  type UpdateItemRequest,
} from "@pass1/shared";
import type { z } from "zod";

// Typed client for the pass1 API, shared by every app. Every response is checked against the
// shared schema, so the rest of the app can trust the types. That includes the KDF settings: a
// server that tried to send weak Argon2 settings (to make the password easier to crack) is
// rejected here.

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface ApiClientOptions {
  /** Where the API is: "/api" on the web (same origin), the server's full URL in a phone app. */
  baseUrl: string;
  /** Tests pass a fake. Defaults to the runtime's fetch. */
  fetch?: typeof fetch;
}

interface RequestContext {
  baseUrl: string;
  fetch: typeof fetch;
  /** Called when the server says the session is gone (see setSessionEndedHandler). */
  onSessionEnded: () => void;
}

async function sendRequest<T>(context: RequestContext, method: string, path: string, schema: z.ZodType<T> | null, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await context.fetch(context.baseUrl + path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, "INTERNAL", "Can't reach pass1. Check your connection and try again.");
  }

  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      if (parsed.data.error.code === "UNAUTHENTICATED") context.onSessionEnded();
      throw new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message);
    }
    throw new ApiRequestError(res.status, "INTERNAL", "The server sent an unexpected response.");
  }

  if (!schema) return undefined as T;
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiRequestError(res.status, "INTERNAL", "The server sent an unexpected response.");
  return parsed.data;
}

/**
 * Makes an API client.
 * Input: { baseUrl: "/api" }. Output: one function per endpoint, e.g. client.listItems(0).
 * Responses that don't match the shared schema throw ApiRequestError, as do API errors.
 */
// The default fetch is wrapped: browsers throw "Illegal invocation" when their fetch is called
// as a method of another object, which context.fetch(...) would do.
export function createApiClient({ baseUrl, fetch: fetchImpl = (...args) => fetch(...args) }: ApiClientOptions) {
  const context: RequestContext = { baseUrl, fetch: fetchImpl, onSessionEnded: () => {} };
  const request = <T>(method: string, path: string, schema: z.ZodType<T> | null, body?: unknown) =>
    sendRequest(context, method, path, schema, body);

  return {
    /**
     * Called when the server says this session no longer exists, e.g. because it was ended from
     * another device or by a password change. The app logs out locally.
     */
    setSessionEndedHandler: (handler: () => void) => {
      context.onSessionEnded = handler;
    },

    challenge: () => request("GET", "/auth/challenge", challengeResponseSchema),
    signup: (body: SignupRequest) => request("POST", "/auth/signup", null, body),
    checkSignup: (signupToken: string) => request("POST", "/auth/signup/check", checkSignupResponseSchema, { signupToken }),
    prelogin: (email: string) => request("POST", "/auth/prelogin", preloginResponseSchema, { email }),
    register: (body: RegisterRequest) => request("POST", "/auth/register", accountResponseSchema, body),
    login: (email: string, authKey: string) => request("POST", "/auth/login", accountResponseSchema, { email, authKey }),
    logout: () => request("POST", "/auth/logout", null),
    me: () => request("GET", "/auth/me", accountResponseSchema),

    /** One page of changes after vault version `since` (0 for everything). See sync.ts. */
    listItems: (since: number) => request("GET", `/vault/items?since=${since}`, listItemsResponseSchema),
    createItem: (body: CreateItemRequest) => request("POST", "/vault/items", vaultItemResponseSchema, body),
    updateItem: (id: string, body: UpdateItemRequest) => request("PUT", `/vault/items/${id}`, vaultItemResponseSchema, body),
    trashItem: (id: string) => request("POST", `/vault/items/${id}/trash`, vaultItemResponseSchema),
    restoreItem: (id: string) => request("POST", `/vault/items/${id}/restore`, vaultItemResponseSchema),
    deleteItem: (id: string) => request("DELETE", `/vault/items/${id}`, null),

    changePassword: (body: ChangePasswordRequest) => request("POST", "/account/password", accountResponseSchema, body),
    listSessions: () => request("GET", "/account/sessions", listSessionsResponseSchema),
    revokeSession: (id: string) => request("DELETE", `/account/sessions/${encodeURIComponent(id)}`, null),
    revokeOtherSessions: () => request("POST", "/account/sessions/revoke-others", null),
    deleteAccount: (authKey: string) => request("DELETE", "/account", null, { authKey }),

    billing: () => request("GET", "/billing", billingStatusResponseSchema),
    checkout: (body: CheckoutRequest) => request("POST", "/billing/checkout", redirectResponseSchema, body),
    billingPortal: () => request("POST", "/billing/portal", redirectResponseSchema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
