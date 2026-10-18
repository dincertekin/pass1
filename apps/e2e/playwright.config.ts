import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: a real browser against the real production build.
//
// Playwright starts the server itself (and stops it afterwards): the built API serving the
// built web app, on port 3200 with an in-memory database, so nothing here touches your
// dev servers or dev database. Run with `npm run test:e2e` from the repo root, which builds first.

const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests",
  // Every test registers its own account, so tests can run side by side.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Locally, use the Google Chrome you already have. CI installs Playwright's Chromium.
        channel: process.env.CI ? undefined : "chrome",
      },
    },
  ],

  webServer: {
    command: "node --enable-source-maps dist/server.js",
    cwd: "../api",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      PORT: String(PORT),
      DATABASE_URL: "pglite:memory",
      WEB_DIST_DIR: "../web/dist",
      WEB_ORIGIN: BASE_URL,
      // Each test registers an account, which the normal limit (5 per hour) wouldn't allow.
      RATE_LIMITS: "relaxed",
    },
  },
});
