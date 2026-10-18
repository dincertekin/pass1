import type { ErrorCode, ErrorResponse } from "@pass1/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import type { z } from "zod";

/** Throw this from any route to send a specific error to the client. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Validates a request body, or throws a 400 that lists what's wrong. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".") || "body");
    throw new ApiError(400, "VALIDATION_FAILED", `Invalid fields: ${[...new Set(fields)].join(", ")}`);
  }
  return result.data;
}

/**
 * Turns every error into the shared `{ error: { code, message } }` shape.
 * Unexpected errors are logged in full but sent as a generic message, so internals never leak.
 */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError, request, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message));
    }
    if (err.statusCode === 429) {
      return reply.status(429).send(errorBody("RATE_LIMITED", "Too many attempts. Wait a minute and try again."));
    }
    // Fastify's own client errors, like malformed JSON or a body that's too large.
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send(errorBody("VALIDATION_FAILED", err.message));
    }

    request.log.error(err);
    return reply.status(500).send(errorBody("INTERNAL", "Something went wrong on our side."));
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(errorBody("NOT_FOUND", "Not found."));
  });
}

function errorBody(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}
