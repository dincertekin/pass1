# syntax=docker/dockerfile:1
#
# The pass1 server: the API plus the built web app, one image. See docs/deploy.md.
# Three stages, so the final image has no compilers, dev tools or source code in it.

ARG NODE_IMAGE=node:24.15.0-bookworm-slim

# 1. Build the web app and bundle the API.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# Package files first, so `npm ci` is cached until a dependency changes.
# The desktop app's Electron is a dev dependency of the workspace; the server never needs its
# 100+ MB binary, so it's never downloaded here.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/crypto/package.json packages/crypto/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
# apps/mobile is left out on purpose: npm builds fine without it, and with it Expo's build
# tools (TypeScript, lightningcss, terser: about 44 MB) would land in the server image.
COPY apps/desktop/package.json apps/desktop/
RUN npm ci
COPY packages packages
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w @pass1/web && npm run build -w @pass1/api

# 2. Only what the API needs at runtime. Workspace packages are already bundled into dist/.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/crypto/package.json packages/crypto/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
COPY apps/desktop/package.json apps/desktop/
RUN npm ci --omit=dev --workspace @pass1/api \
 # PGlite is only for development, but npm keeps it because drizzle-orm lists it as an optional
 # peer. (--omit=optional would also drop Argon2's native binaries, so remove just this one.)
 && rm -rf node_modules/@electric-sql

# 3. The image that runs.
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WEB_DIST_DIR=/app/web
WORKDIR /app/apps/api
COPY --from=deps /app/node_modules /app/node_modules
# package.json says "type": "module", which Node needs to run dist/server.js.
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
COPY --from=build /app/apps/web/dist /app/web

# Never run as root. The `node` user comes with the base image.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/server.js"]
