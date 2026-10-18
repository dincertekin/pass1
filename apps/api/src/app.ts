import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({
    logger: {
      // Never log request bodies: they carry auth keys and encrypted vault data.
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
      },
    },
  });

  app.get("/health", async () => ({ status: "ok" }));

  // Weekend 2: POST /auth/prelogin, /auth/register, /auth/login
  // Weekend 3: GET/POST/PUT/DELETE /vault/items

  return app;
}
