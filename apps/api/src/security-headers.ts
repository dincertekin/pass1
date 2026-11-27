import helmet from "@fastify/helmet";
import { contentSecurityPolicy, PERMISSIONS_POLICY } from "@pass1/shared";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";

// HTTP security headers for every response, including the web app's HTML. The
// Content-Security-Policy itself is defined in @pass1/shared (content-security-policy.ts), shared
// with the desktop app.

/** This response's style nonce. web-app.ts puts the same value into the page. */
export const styleNonces = new WeakMap<ServerResponse, string>();

export async function registerSecurityHeaders(app: FastifyInstance) {
  app.addHook("onRequest", async (_request, reply) => {
    const nonce = randomBytes(16).toString("base64");
    styleNonces.set(reply.raw, nonce);
    reply.header("content-security-policy", contentSecurityPolicy(nonce));
  });

  await app.register(helmet, {
    // Set above, from the definition shared with the desktop app.
    contentSecurityPolicy: false,
    // Don't tell other sites where users came from (URLs can contain item IDs).
    referrerPolicy: { policy: "no-referrer" },
    // Browsers only talk to pass1 over HTTPS for a year after the first visit.
    strictTransportSecurity: { maxAge: 365 * 24 * 60 * 60, includeSubDomains: true },
  });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("permissions-policy", PERMISSIONS_POLICY);
  });
}
