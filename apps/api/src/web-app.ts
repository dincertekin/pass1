import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply } from "fastify";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { styleNonces } from "./security-headers.js";

const NONCE_PLACEHOLDER = "__CSP_NONCE__";
let indexHtml = "";

// In production the API also serves the built web app, so the whole of pass1 is one origin:
// https://pass1.com/ for the app and https://pass1.com/api/ for the API. One origin means the
// strict CSP above can say 'self' everywhere, and cookies never cross sites.

export async function serveWebApp(app: FastifyInstance, distDir: string) {
  // Read once at startup. Fails fast if the web app wasn't built.
  indexHtml = readFileSync(join(resolve(distDir), "index.html"), "utf8");

  await app.register(fastifyStatic, {
    root: resolve(distDir),
    // index.html is served by the not-found handler below, so every app URL gets it.
    index: false,
    setHeaders(reply, path) {
      // Vite puts a content hash in every asset's file name, so they can be cached forever.
      // Everything else (index.html, the favicon) is checked on each visit, so a deploy
      // reaches users on their next page load.
      const cacheControl = path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
      reply.header("cache-control", cacheControl);
    },
  });

  // "/" would otherwise be treated as a directory listing request, which static serving refuses,
  // and /index.html would be sent as the raw file without its nonce.
  app.get("/", (_request, reply) => sendAppPage(reply));
  app.get("/index.html", (_request, reply) => sendAppPage(reply));
}

/**
 * The app's single HTML page, with this response's style nonce filled in.
 * Never cached: the nonce is new every time, and a new deploy reaches users on the next load.
 */
export function sendAppPage(reply: FastifyReply) {
  const html = indexHtml.replaceAll(NONCE_PLACEHOLDER, styleNonces.get(reply.raw) ?? "");
  return reply.header("cache-control", "no-store").type("text/html; charset=utf-8").send(html);
}

/** True for requests the web app should answer: page loads of app URLs like /vault or /settings. */
export function isAppPageRequest(method: string, url: string) {
  return (method === "GET" || method === "HEAD") && !url.startsWith("/api/") && url !== "/api";
}
