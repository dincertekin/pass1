import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The first test in each file starts an in-memory Postgres (PGlite) and runs the
    // migrations, which takes a few seconds when several test files start at once.
    testTimeout: 20_000,
    // Against a real Postgres (TEST_DATABASE_URL), test files share one database,
    // so they must not run at the same time. See src/test-helpers.ts.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
