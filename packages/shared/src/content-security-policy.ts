// The web app's Content-Security-Policy, in one place for every app that shows it: the API
// sends it with the page (apps/api/src/security-headers.ts), and the desktop app with its own
// copy of the page (apps/desktop). One definition, so the two can't drift apart.
//
// A web password manager's biggest risk is someone getting their own JavaScript to run on the
// page, where it could read the vault. This policy allows only scripts, styles and connections
// from pass1's own origin: no inline scripts, no inline <style>, no CDNs, no third parties. If
// something breaks after a change, check the console for CSP violations before loosening anything.

const DIRECTIVES = (styleNonce: string): [name: string, sources: string[]][] => [
  ["default-src", ["'none'"]],
  // 'wasm-unsafe-eval' lets the page compile WebAssembly (Argon2 runs as WASM). It doesn't
  // allow eval() or new Function() for JavaScript.
  ["script-src", ["'self'", "'wasm-unsafe-eval'"]],
  // Plus one nonce per page load, for the single <style> element Radix dialogs add
  // (see apps/web/src/csp-setup.ts). An injected <style> can't know the nonce.
  ["style-src", ["'self'", `'nonce-${styleNonce}'`]],
  ["img-src", ["'self'"]],
  ["font-src", ["'self'"]],
  ["connect-src", ["'self'"]],
  // The Argon2 and sign-up puzzle Web Workers are files on our own origin.
  ["worker-src", ["'self'"]],
  ["manifest-src", ["'self'"]],
  ["base-uri", ["'none'"]],
  ["form-action", ["'self'"]],
  // No site may put pass1 in a frame, so it can't be overlaid by a clickjacking page.
  ["frame-ancestors", ["'none'"]],
  // Dangerous DOM calls (innerHTML, new Worker(url), ...) only accept values made by a
  // Trusted Types policy, and the only policy allowed is pass1-worker, which accepts just
  // pass1's own worker files (see apps/web/src/lib/workers.ts).
  ["require-trusted-types-for", ["'script'"]],
  ["trusted-types", ["pass1-worker"]],
];

/**
 * The policy as a header value.
 * Input: this page load's style nonce (random, base64). Output: "default-src 'none'; script-src ...".
 */
export function contentSecurityPolicy(styleNonce: string): string {
  return DIRECTIVES(styleNonce)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}

/** Browser features pass1 never uses, switched off so injected code can't use them either. */
export const PERMISSIONS_POLICY = ["camera=()", "microphone=()", "geolocation=()", "payment=()", "usb=()", "interest-cohort=()"].join(", ");

/** Where the page's HTML carries the style nonce (index.html has this placeholder). */
export const STYLE_NONCE_PLACEHOLDER = "__CSP_NONCE__";
