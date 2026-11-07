# What's built

Everything below is done and tested. What's next is in the [roadmap](../README.md#roadmap).

- [x] Monorepo (npm workspaces), TypeScript, CI
- [x] Crypto: Argon2id, HKDF, a wrapped random vault key, AES-256-GCM items
- [x] Versioned crypto format v1: item ID bound as associated data, items padded to 256-byte buckets, a pinned test vector
- [x] Shared zod schemas for every request and response, used by the API and the web app
- [x] Postgres with Drizzle migrations; PGlite (Postgres in WebAssembly) in development and tests, and CI also runs the API tests on Postgres 18
- [x] Config from env, validated at startup
- [x] Auth: prelogin with fake salts for unknown emails, register, login, logout; hashed session tokens in an httpOnly, Secure, SameSite=Strict cookie
- [x] Rate limits, security headers, Origin check on every request that changes data, per-account login throttle
- [x] Register screen with strength meter and "no recovery" acknowledgment; unlock screen; Argon2id in a Web Worker
- [x] Keys in memory only; reloading or locking clears them, verified with Chrome heap snapshots
- [x] Vault: create, edit, trash, restore, favorites, search, keyboard shortcuts; three panes with a resizable list, stacked on mobile
- [x] Stale edits rejected by revision number instead of overwriting newer data
- [x] Plan limits enforced by the server (items, total bytes, size per item), with a usage meter in the sidebar
- [x] Password generator, auto-lock, clipboard auto-clear with countdown
- [x] Password health: reused and weak passwords, found in the browser
- [x] Settings in a dialog, including appearance and density
- [x] Change master password (re-wraps the vault key, ends other sessions)
- [x] Encrypted export and import; import from Chrome, Edge, Safari, Bitwarden and 1Password
- [x] Active sessions list with revoke; account deletion
- [x] Strict Content-Security-Policy (no inline scripts, no eval, Trusted Types, per-load style nonce)
- [x] Playwright end-to-end tests, each one also failing on any CSP violation
- [x] Docker image (non-root, read-only filesystem) and Compose stack: Caddy (HTTPS), app, Postgres, daily backups
- [x] Backup and restore scripts, tested by restoring onto a fresh stack; guide in [docs/deploy.md](deploy.md)
- [x] Health check that includes the database, JSON request logs without bodies
- [x] Security review of the whole app ([docs/security-review.md](security-review.md)), findings fixed and tested
- [x] Paddle checkout and customer portal; signed webhooks update the plan, applied once and in order
- [x] Paddle's script runs only on a separate checkout origin, never where vaults are decrypted
- [x] Downgrade or failed payment never deletes data: over the limit, the vault becomes read-only
- [x] "Get pass1 Plus" in the sidebar and a plans dialog with yearly and monthly prices
