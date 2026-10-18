import { defineConfig } from "drizzle-kit";

// `npm run db:generate -w @pass1/api` compares src/db/schema.ts with the existing
// migrations and writes a new SQL file to drizzle/ for whatever changed.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
