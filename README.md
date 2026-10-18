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

## Threat model

| Protects against | Does not protect against |
|---|---|
| Database leak or server breach | Malware or a keylogger on the user's device |
| A malicious server operator reading vaults | A compromised server serving malicious JavaScript (a limit of every web-based password manager) |
| Traffic interception | Weak master passwords (Argon2id slows guessing but can't prevent it) |

**There is no account recovery.** If the master password is lost, the vault cannot be decrypted. That is the point of zero knowledge.

## Project structure

```
packages/crypto   Key derivation, vault key wrapping, item encryption + tests
apps/api          Fastify + TypeScript REST API
apps/web          React + TypeScript + Vite client
```

## Getting started

Requires Node.js 22+.

```bash
npm install
npm test            # run all tests
npm run dev:api     # API on http://localhost:3000
npm run dev:web     # web app on http://localhost:5173
```

## Roadmap

Each phase ends with something that works and has tests. Don't start a phase until the previous one is done.

### Phase 0: Foundation ✅

- [x] Monorepo (npm workspaces), TypeScript, CI
- [x] Crypto package with tests: Argon2id, HKDF, vault key wrapping, AES-256-GCM items
- [x] Design tokens (Tailwind), self-hosted mono font, base components (Button, Badge, TextField, PasswordField)

### Phase 1: Database and auth API

- [x] Freeze crypto format v1 before any real data exists:
  - a version field in every encrypted blob, so the format can be upgraded later
  - item ID bound as AES-GCM associated data, so the server can't swap one item's ciphertext for another's
  - padding items to fixed size buckets, so ciphertext size doesn't reveal password length
- [ ] `packages/shared`: zod schemas for every request and response, used by both the API and the web app
- [ ] Drizzle ORM on SQLite with migrations (drizzle-kit)
- [ ] Tables: `users` (email, KDF salt and params, Argon2id hash of the auth key, wrapped vault key, plan) and `sessions`
- [ ] Config read from env and validated with zod at startup
- [ ] `POST /auth/prelogin`: returns the KDF salt and params; unknown emails get a stable fake salt so accounts can't be enumerated
- [ ] `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me`
- [ ] Sessions: random token in an httpOnly, Secure, SameSite=Strict cookie, stored hashed in the database
- [ ] Rate limiting on auth routes, security headers
- **Done when:** integration tests cover every route, including wrong password, duplicate email and rate limit

### Phase 2: Auth UI

- [ ] Routing (React Router) and a typed API client
- [ ] Register screen: strength meter (zxcvbn-ts) and the "no recovery" acknowledgment
- [ ] Unlock screen with Argon2id progress state
- [ ] Keys live in memory only, never in localStorage; reloading the page locks the vault
- **Done when:** register → log out → log in works in the browser

### Phase 3: Vault

- [ ] `vault_items` table (ciphertext only) and CRUD routes, scoped to the session's user
- [ ] Revision number per item, so a stale edit is rejected instead of overwriting newer data
- [ ] Three-pane vault: sidebar, searchable list, item detail; stacks on mobile
- [ ] Create, edit, delete (to Trash), favorites
- [ ] Keyboard: `/` or `⌘K` to search, arrows to move, `Enter` to open
- [ ] Plan limits enforced by the server on every create and edit: item count, total stored bytes, and a maximum size per item. Free plan: 500 items, 10 MB
- [ ] Usage meter in the sidebar (e.g. "312 of 500 items")
- **Done when:** items survive a reload, the database contains no plaintext, and item 501 on the free plan is rejected

### Phase 4: Everyday safety

- [ ] Password generator (length, character sets, passphrases)
- [ ] Auto-lock after inactivity, configurable
- [ ] Copy with clipboard auto-clear and countdown toast
- [ ] Settings page
- **Done when:** a locked vault holds no keys in memory, verified by test

### Phase 5: Account management

- [ ] Change master password: re-wrap the vault key and end all other sessions
- [ ] Encrypted export and import
- [ ] Active sessions list with revoke
- [ ] Delete account
- **Done when:** after a password change, the old password can't log in and every item still decrypts

### Phase 6: Production

- [ ] Strict Content-Security-Policy (no inline scripts or styles), Origin check on writes
- [ ] Switch to PostgreSQL (or MySQL): change the Drizzle dialect, regenerate migrations
- [ ] End-to-end tests with Playwright
- [ ] Docker image, deployment, backups
- [ ] Monitoring, error tracking and logs that never contain secrets
- [ ] Backups with a tested restore
- **Done when:** a fresh server can be deployed and restored from backup by following the docs

### Phase 7: Plans and billing

- [ ] Three plans, defined in one config file:

  | | Free | pass1 Plus | pass1 Unlimited |
  |---|---|---|---|
  | Items / storage | 500 / 10 MB | 5,000 / 100 MB | Unlimited (1 GB fair-use cap) |
  | Yearly | $0 | $19 | $39 |
  | Monthly | | $2.49 | $4.49 |
  | Features | Everything in the vault | + TOTP codes, breach report, file attachments | + emergency access, priority support |

- [ ] Paddle (merchant of record, handles VAT and sales tax) checkout and customer portal, with webhooks updating the user's plan
- [ ] `subscriptions` table: provider IDs, status and renewal date only; no card details ever touch pass1
- [ ] "Get pass1 Plus" in the sidebar and a pricing page
- [ ] Downgrade or failed payment never deletes data: over the limit, the vault becomes read-only (view, copy, export and delete still work)
- **Done when:** upgrade, renewal, cancel and failed payment are all covered by tests using the provider's test mode

### Phase 8: Public launch

- [ ] Email verification, privacy-friendly CAPTCHA and rate limits on sign-up
- [ ] Landing page that explains the security model in plain words
- [ ] Terms of service, privacy policy, GDPR data export and deletion
- [ ] `security.txt`, a vulnerability disclosure policy, a status page
- [ ] Published hash of every release, built reproducibly from the public source
- [ ] Independent security audit, with the report published
- **Done when:** the audit findings are fixed and sign-up is open

### Later

- [ ] Breach check (HIBP k-anonymity), reused and weak password report
- [ ] TOTP 2FA, passkeys
- [ ] Browser extension

## License

[MIT](./LICENSE)
