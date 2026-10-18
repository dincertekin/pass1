// Runs before anything else in the app (it's the first import in main.tsx), because
// both settings below must be in place before any library code runs.
import { setNonce } from "get-nonce";
import { config as zodConfig } from "zod";

// zod normally tests whether `new Function()` works so it can generate faster validators.
// pass1's CSP forbids that, so skip the test instead of logging a CSP violation.
zodConfig({ jitless: true });

// Radix dialogs add one <style> element (to stop the page behind a dialog from scrolling).
// The CSP blocks inline styles unless they carry this page load's nonce, which the server
// puts in a <meta> tag (see apps/api/src/web-app.ts). In development there's no CSP and the
// placeholder is left as is, so it's ignored.
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-style-nonce"]')?.content;
if (nonce && nonce !== "__CSP_NONCE__") setNonce(nonce);
