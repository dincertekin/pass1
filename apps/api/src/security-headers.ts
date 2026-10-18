import helmet from "@fastify/helmet";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";

// HTTP security headers for every response, including the web app's HTML.
//
// The Content-Security-Policy is the most important one. A web password manager's biggest risk
// is someone getting their own JavaScript to run on the page, where it could read the vault.
// This policy allows only scripts, styles and connections from pass1's own origin: no inline
// scripts, no inline <style>, no CDNs, no third parties. If something on the page breaks
// after a change, check the browser console for CSP violations before loosening anything here.

const CSP_DIRECTIVES = {
  defaultSrc: ["'none'"],
  // 'wasm-unsafe-eval' lets the page compile WebAssembly (Argon2 runs as WASM). It doesn't
  // allow eval() or new Function() for JavaScript.
  scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
  // Plus one nonce per page load, for the single <style> element Radix dialogs add
  // (see apps/web/src/csp-setup.ts). An injected <style> can't know the nonce.
  styleSrc: ["'self'", (_req: unknown, res: ServerResponse) => `'nonce-${styleNonces.get(res)}'`],
  imgSrc: ["'self'"],
  fontSrc: ["'self'"],
  connectSrc: ["'self'"],
  // The Argon2 Web Worker is a file on our own origin.
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  baseUri: ["'none'"],
  formAction: ["'self'"],
  // No site may put pass1 in a frame, so it can't be overlaid by a clickjacking page.
  frameAncestors: ["'none'"],
  // Dangerous DOM calls (innerHTML, new Worker(url), ...) only accept values made by a
  // Trusted Types policy, and the only policy allowed is pass1-worker, which accepts just the
  // key derivation worker's URL (see apps/web/src/lib/trusted-types.ts).
  requireTrustedTypesFor: ["'script'"],
  trustedTypes: ["pass1-worker"],
};

// Browser features pass1 never uses, switched off so injected code can't use them either.
const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "interest-cohort=()",
].join(", ");

/** This response's style nonce. web-app.ts puts the same value into the page. */
export const styleNonces = new WeakMap<ServerResponse, string>();

export async function registerSecurityHeaders(app: FastifyInstance) {
  // Must run before helmet's own hook, which builds the CSP header.
  app.addHook("onRequest", async (_request, reply) => {
    styleNonces.set(reply.raw, randomBytes(16).toString("base64"));
  });

  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
    // Don't tell other sites where users came from (URLs can contain item IDs).
    referrerPolicy: { policy: "no-referrer" },
    // Browsers only talk to pass1 over HTTPS for a year after the first visit.
    strictTransportSecurity: { maxAge: 365 * 24 * 60 * 60, includeSubDomains: true },
  });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("permissions-policy", PERMISSIONS_POLICY);
  });
}
