// Bundles the API into dist/server.js.
// Workspace packages (@pass1/*) are TypeScript source, so they're bundled in.
// npm dependencies stay external and load from node_modules, like any Node app.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith("@pass1/"));

await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
});
