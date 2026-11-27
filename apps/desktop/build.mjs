// Bundles the main process and the preload script into dist/. Workspace packages (@pass1/*) are
// TypeScript source, so they're bundled in; Electron itself is provided at runtime.
import { build } from "esbuild";

const shared = { bundle: true, platform: "node", target: "node22", sourcemap: true, external: ["electron"] };

await build({ ...shared, entryPoints: ["src/main.ts"], outfile: "dist/main.js", format: "esm" });
// Sandboxed preload scripts must be CommonJS.
await build({ ...shared, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs", format: "cjs" });
