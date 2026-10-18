import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The key derivation worker imports @pass1/crypto, so it needs ES module output.
  worker: { format: "es" },
  build: {
    // The password-strength dictionaries are one ~1.2 MB chunk. They load only on the
    // register screen (see lib/password-strength.ts), so the size warning is expected.
    chunkSizeWarningLimit: 1300,
  },
  server: {
    proxy: { "/api": { target: "http://localhost:3000", rewrite: (path) => path.replace(/^\/api/, "") } },
  },
});
