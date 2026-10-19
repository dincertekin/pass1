# pass1

A zero-knowledge password manager for the web. Your vault is encrypted in the browser before it is sent anywhere, so the server only ever stores ciphertext it cannot read.

> 🚧 Work in progress. See the [roadmap](#roadmap).

## How it works

```
master password ──Argon2id(salt)──► master key (never leaves the browser)
                                       │
                        HKDF ┌─────────┴─────────┐
                             ▼                   ▼
                      encryption key          auth key ──► sent to server,
                             │                              stored as Argon2id(auth key)
                             ▼
              unwraps a random VAULT KEY (stored encrypted on the server)
                             │
                             ▼
       each item: AES-256-GCM(vault key, random IV, AAD = item ID, padded JSON{name, url, username, password, notes})
```

- **The server never sees the master password or any plaintext.** It receives an auth key derived through HKDF, which can't be used to recover the encryption key.
- **A random vault key, wrapped by the master key.** Changing the master password re-wraps one key instead of re-encrypting every item.
- **Whole-item encryption.** Site names and URLs are encrypted too.
- **Padding.** Each item is padded to a multiple of 256 bytes, so the size of the ciphertext doesn't reveal how long a password is.
- **Bound to its ID.** The item ID is authenticated with the ciphertext (AES-GCM associated data), so a server that swaps two items' ciphertexts causes decryption to fail instead of showing the wrong password.
- **Versioned.** Every stored blob carries a format version, and a pinned test vector makes sure existing vaults keep decrypting.
- **Standard primitives only:** Argon2id (via `hash-wasm`), HKDF-SHA256 and AES-256-GCM (via the Web Crypto API).

The latest security review, with every finding and accepted risk: [docs/security-review.md](docs/security-review.md).

## Threat model

| Protects against | Does not protect against |
|---|---|
| Database leak or server breach | Malware or a keylogger on the user's device |
| A malicious server operator reading vaults | A compromised server serving malicious JavaScript (a limit of every web-based password manager) |
| Traffic interception | Weak master passwords (Argon2id slows guessing but can't prevent it) |
| Guessing a master password through the login form, from one machine or many | A malicious server rolling an item back to an older version, or hiding an item |

**What the server can see:** your email; how many items you have and their sizes (padded to 256 bytes); when each was created, changed or moved to the trash; and, for each logged-in device, the browser name and when it was last used. It never sees item names, websites, usernames, passwords or notes, and it doesn't log IP addresses.

**There is no account recovery.** If the master password is lost, the vault cannot be decrypted. That is the point of zero knowledge.

## Project structure

```
packages/crypto   Key derivation, vault key wrapping, item encryption + tests
packages/shared   zod schemas for API requests and responses, plan limits
apps/api          Fastify + TypeScript REST API, Drizzle ORM on Postgres (PGlite in development)
apps/web          React + TypeScript + Vite client
apps/e2e          Playwright end-to-end tests against the production build
```

## Getting started

Requires Node.js 22+.

```bash
npm install
npm test            # run all tests
npm run dev:api     # API on http://localhost:3000 (database in apps/api/data/pglite, no setup needed)
npm run dev:web     # web app on http://localhost:5173
npm run test:e2e    # builds, then runs the browser tests (uses your installed Google Chrome)
```

Deploying to a server: [docs/deploy.md](docs/deploy.md).

## Roadmap

Each phase ends with something that works and has tests. Don't start a phase until the previous one is done.

### Phase 0: Foundation ✅

- [x] Monorepo (npm workspaces), TypeScript, CI
- [x] Crypto package with tests: Argon2id, HKDF, vault key wrapping, AES-256-GCM items
- [x] Design tokens (Tailwind), self-hosted mono font, base components (Button, Badge, TextField, PasswordField)

### Phase 1: Database and auth API ✅

- [x] Freeze crypto format v1 before any real data exists:
  - a version field in every encrypted blob, so the format can be upgraded later
  - item ID bound as AES-GCM associated data, so the server can't swap one item's ciphertext for another's
  - padding items to fixed size buckets, so ciphertext size doesn't reveal password length
- [x] `packages/shared`: zod schemas for every request and response, used by both the API and the web app
- [x] Drizzle ORM with migrations (drizzle-kit); started on SQLite, moved to Postgres in Phase 6
- [x] Tables: `users` (email, KDF salt and params, Argon2id hash of the auth key, wrapped vault key, plan) and `sessions`
- [x] Config read from env and validated with zod at startup
- [x] `POST /auth/prelogin`: returns the KDF salt and params; unknown emails get a stable fake salt so accounts can't be enumerated
- [x] `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me`
- [x] Sessions: random token in an httpOnly, Secure, SameSite=Strict cookie, stored hashed in the database
- [x] Rate limiting on auth routes, security headers
- [x] Origin check on every request that changes data (on top of SameSite=Strict)
- **Done ✅:** integration tests cover every route, including wrong password, duplicate email and rate limit

### Phase 2: Auth UI ✅

- [x] Routing (React Router) and a typed API client
- [x] Register screen: strength meter (zxcvbn-ts) and the "no recovery" acknowledgment
- [x] Unlock screen with Argon2id progress state
- [x] Argon2id runs in a Web Worker so the page never freezes
- [x] Keys live in memory only, never in localStorage; reloading the page locks the vault
- **Done ✅:** register → log out → log in works in the browser

### Phase 3: Vault ✅

- [x] `vault_items` table (ciphertext only) and CRUD routes, scoped to the session's user
- [x] Revision number per item, so a stale edit is rejected instead of overwriting newer data
- [x] Three-pane vault: sidebar, searchable list, item detail; stacks on mobile
- [x] Create, edit, delete (to Trash), favorites
- [x] Keyboard: `/` or `⌘K` to search, arrows to move, `Enter` to open
- [x] Plan limits enforced by the server on every create and edit: item count, total stored bytes, and a maximum size per item. Free plan: 500 items, 10 MB
- [x] Usage meter in the sidebar (e.g. "312 of 500 items")
- **Done ✅:** items survive a reload, the database contains no plaintext, and item 501 on the free plan is rejected

### Phase 4: Everyday safety ✅

- [x] Password generator (length, character sets, passphrases)
- [x] Auto-lock after inactivity, configurable
- [x] Copy with clipboard auto-clear and countdown toast
- [x] Settings page
- **Done ✅:** a locked vault holds no keys in memory, verified with Chrome heap snapshots (unlocked: vault key and item passwords present; locked: none)

### Phase 5: Account management ✅

- [x] Change master password: re-wrap the vault key and end all other sessions
- [x] Encrypted export and import
- [x] Import from Chrome, Edge, Safari, Bitwarden (CSV or JSON) and 1Password, read in the browser
- [x] Active sessions list with revoke
- [x] Delete account
- **Done ✅:** after a password change, the old password can't log in and every item still decrypts

### Phase 6: Production

- [x] Strict Content-Security-Policy (no inline scripts, no eval, Trusted Types, per-load style nonce), verified with zero violations in Chrome
- [x] API under `/api`, serving the built web app from the same origin
- [x] Postgres everywhere: real Postgres in production, PGlite (Postgres in WebAssembly) in development and tests; CI also runs the API tests on Postgres 18
- [x] End-to-end tests with Playwright (27 tests, every one also fails on any CSP violation), including the heap snapshot check that a locked vault holds no keys or plaintext
- [x] Docker image (non-root, read-only filesystem, health check) and Compose stack: Caddy (HTTPS), app, Postgres, backups
- [x] Daily backups, kept 14 days, never of an empty database; restore script; guide in [docs/deploy.md](docs/deploy.md)
- [x] Health check that includes the database, JSON request logs without bodies, real client IPs behind the proxy
- [ ] Error tracking (Sentry or similar, with nothing sensitive in reports)
- [x] Security review of the whole app ([docs/security-review.md](docs/security-review.md)); findings fixed and tested
- **Done when:** a fresh server can be deployed and restored from backup by following the docs. ✅ Done locally: data created over HTTPS, backed up, every volume deleted, restored onto a fresh stack, logged in, items decrypted

### Phase 7: Plans and billing

- [x] Three plans, defined in one config file (`packages/shared/src/plans.ts`); the paid features in the last row are built in later phases:

  | | Free | pass1 Plus | pass1 Unlimited |
  |---|---|---|---|
  | Items / storage | 500 / 10 MB | 5,000 / 100 MB | Unlimited (1 GB fair-use cap) |
  | Yearly | $0 | $19 | $39 |
  | Monthly | | $2.49 | $4.49 |
  | Features | Everything in the vault | + TOTP codes, breach report, file attachments | + emergency access, priority support |

- [x] Paddle (merchant of record, handles VAT and sales tax) checkout and customer portal, with webhooks updating the user's plan. Webhooks are signature-checked, applied once, and ignored when out of order; deleting an account cancels its subscription first
- [x] Paddle's script runs only on a separate checkout origin (`apps/checkout/`, served by Caddy with its own CSP), never where vaults are decrypted
- [x] `subscriptions` table: provider IDs, status and renewal date only; no card details ever touch pass1
- [x] "Get pass1 Plus" in the sidebar and a plans dialog with yearly and monthly prices
- [x] Downgrade or failed payment never deletes data: over the limit, the vault becomes read-only (view, copy, export and delete still work)
- **Done when:** upgrade, renewal, cancel and failed payment are all covered by tests using the provider's test mode. Covered by API tests that feed the app Paddle-shaped, signed webhook events; ⏳ still to do: one real run through Paddle's sandbox (needs a Paddle account, see [docs/deploy.md](docs/deploy.md#billing-with-paddle))

### Phase 8: Public launch

- [ ] Email verification, privacy-friendly CAPTCHA and rate limits on sign-up
- [ ] Landing page that explains the security model in plain words
- [ ] Terms of service, privacy policy, GDPR data export and deletion
- [ ] `security.txt`, a vulnerability disclosure policy, a status page
- [ ] Published hash of every release, built reproducibly from the public source
- [ ] Independent security audit, with the report published
- **Done when:** the audit findings are fixed and sign-up is open

### Later

- [x] Password health: reused and weak passwords, found in the browser
- [ ] Breach check (HIBP k-anonymity)
- [ ] TOTP 2FA, passkeys
- [ ] Browser extension

## License

[MIT](./LICENSE)
