import {
  accountResponseSchema,
  errorResponseSchema,
  listItemsResponseSchema,
  preloginResponseSchema,
  vaultItemResponseSchema,
  type CreateItemRequest,
  type ErrorCode,
  type RegisterRequest,
  type UpdateItemRequest,
} from "@pass1/shared";
import type { z } from "zod";

// Typed client for the pass1 API. Every response is checked against the shared schema, so
// the rest of the app can trust the types. That includes the KDF settings: a server that
// tried to send weak Argon2 settings (to make the password easier to crack) is rejected here.

/** In development Vite forwards /api to the API server (see vite.config.ts). */
const BASE = "/api";

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

async function request<T>(method: string, path: string, schema: z.ZodType<T> | null, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(0, "INTERNAL", "Can't reach pass1. Check your connection and try again.");
  }

  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) throw new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message);
    throw new ApiRequestError(res.status, "INTERNAL", "The server sent an unexpected response.");
  }

  if (!schema) return undefined as T;
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiRequestError(res.status, "INTERNAL", "The server sent an unexpected response.");
  return parsed.data;
}

export const api = {
  prelogin: (email: string) => request("POST", "/auth/prelogin", preloginResponseSchema, { email }),
  register: (body: RegisterRequest) => request("POST", "/auth/register", accountResponseSchema, body),
  login: (email: string, authKey: string) => request("POST", "/auth/login", accountResponseSchema, { email, authKey }),
  logout: () => request("POST", "/auth/logout", null),
  me: () => request("GET", "/auth/me", accountResponseSchema),

  listItems: () => request("GET", "/vault/items", listItemsResponseSchema),
  createItem: (body: CreateItemRequest) => request("POST", "/vault/items", vaultItemResponseSchema, body),
  updateItem: (id: string, body: UpdateItemRequest) => request("PUT", `/vault/items/${id}`, vaultItemResponseSchema, body),
  trashItem: (id: string) => request("POST", `/vault/items/${id}/trash`, vaultItemResponseSchema),
  restoreItem: (id: string) => request("POST", `/vault/items/${id}/restore`, vaultItemResponseSchema),
  deleteItem: (id: string) => request("DELETE", `/vault/items/${id}`, null),
};
