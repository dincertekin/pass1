# pass1 security review

**Date:** 19 October 2026 · **Reviewer:** internal (development team) · **Scope:** the whole repository at the end of roadmap Phase 6

This is an internal review, not the independent audit planned for Phase 8. Its job is to find what can be fixed now, and to write down the risks pass1 accepts so the auditors, and anyone reading the code, can see them.

## How it was reviewed

- Read every part as an attacker would: crypto (`packages/crypto`), schemas (`packages/shared`), auth, sessions and vault routes (`apps/api`), the web client (`apps/web`), and the deployment (`Dockerfile`, `compose.yaml`, `deploy/`).
- Searched the code for dangerous patterns: HTML injection (`innerHTML`, `dangerouslySetInnerHTML`), `eval`, raw SQL, `Math.random`, `console` output, browser storage. None found outside comments.
- Probed the running API for each suspected weakness before deciding on it (caching headers, URL limits, guessing from many IPs).
- Ran the production stack (Caddy, app, Postgres) and checked headers, cookies, capabilities and logs from outside.
- `npm audit`: no known vulnerabilities in production dependencies.
- The existing tests: 154 unit and API tests, and 27 browser tests, including the heap check that a locked vault leaves no keys or passwords in memory.

## Findings, all fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | No limit on failed logins **per account**. Per-IP limits don't stop guessing spread over many machines: 40 guesses from 40 IPs were all checked. | After 10 failures in 15 minutes, the account refuses logins from every IP, the right password included, and the same happens for unknown emails so nothing is revealed. [`login-throttle.ts`](../apps/api/src/auth/login-throttle.ts), tested. |
| 2 | Low | API responses had no `Cache-Control`, so encrypted vaults and account data could be kept in a browser's disk cache or a cache in between. | Every `/api/` response is `Cache-Control: no-store`. Tested. |
| 3 | Low | The app and Caddy containers kept default Linux capabilities they never use. | The app runs with none, and Caddy only with the right to bind ports 80 and 443. Checked in the running stack. |
| 4 | Low | `caddy:2` and `postgres:18` were floating tags, and nothing kept any version current. | Exact image versions, plus Dependabot for npm, Docker and GitHub Actions (npm updates wait 14 days). |
| 5 | Low | Expired sessions were only deleted when the same user logged in again; inactive users' sessions stayed forever. | Deleted every hour. Tested. |
| 6 | Info | The session ID in `DELETE /api/account/sessions/:id` wasn't format-checked (Fastify's 100-character URL parameter limit already stopped abuse). | Must be exactly 64 hex characters. |

Found and fixed earlier during development, and covered by tests since:
- **The password-strength library kept the master password in memory after locking** (zxcvbn stores the last password it checked). Now wiped after every check.
- **Two simultaneous saves could both pass the plan-limit or revision check on Postgres.** Fixed with a per-user row lock.
- **The CSP was tightened until there were zero violations**, with Trusted Types, no inline scripts, and a per-page-load style nonce.

## Accepted risks and open decisions

| # | Risk | Why it's accepted for now | Plan |
|---|---|---|---|
| A | Registering with an email that's taken says so, which reveals that it has an account. | Every service without email verification has this. It's rate-limited to 5 per hour per IP. | Phase 8 email verification: registration always says "check your inbox". |
| B | An attacker can trigger finding 1's block and stop someone logging in on a **new** device for up to 15 minutes at a time. | Logged-in devices and unlocking (which never contacts the server) keep working. Unlimited guessing is the worse risk. | Phase 8 CAPTCHA can replace the hard block. |
| C | Rate limits and the login block live in memory. | Correct for one server. Restarting resets them, which only helps an attacker briefly. | A shared store (Redis) before running several API servers. |
| D | A compromised server could send malicious JavaScript that reads vaults as they're decrypted. | A limit of every web-based password manager. The strict CSP and Trusted Types make injected script much harder, but can't stop the server itself. | Phase 8: published release hashes and reproducible builds; later the browser extension. |
| E | A malicious server can roll an item back to an older encrypted version, or hide items. | Item IDs are bound into the ciphertext, so it can't swap items, but it can choose which versions to serve. | Signed vault snapshots, if needed; documented in the README threat model. |
| F | `GET /api/vault/items` returns the whole vault in one response: up to 1 GB on the Unlimited plan. | Real vaults are a few hundred KB. Only the account's owner can request it. | Pagination or streaming before pass1 Unlimited launches. |
| G | Daily backups on the server's disk aren't encrypted. | Vault contents inside them are already encrypted. Emails and Argon2 hashes aren't. | [docs/deploy.md](deploy.md) explains encrypting copies before they leave the server. Consider encrypting at rest too. |
| H | Caddy compresses HTTPS responses, and compression plus secrets can leak through response sizes (BREACH). | Responses holding secrets require a `SameSite=Strict` cookie and a matching `Origin`, so another site can't make the browser fetch them and measure the size. | Revisit if any response ever reflects user input next to a secret. |
| I | `npm audit` lists 4 moderate warnings in development dependencies. | They're in an old esbuild copy inside drizzle-kit and affect only esbuild's dev server, which drizzle-kit doesn't run. Never shipped. | Dependabot updates drizzle-kit when a fixed version exists. |
| J | No error tracking (Sentry or similar). | Crashes are logged on the server. A third-party service needs strict rules on what leaves the server first. | If added: self-hosted (for example GlitchTip), and never request bodies, headers, cookies or URLs with IDs. |

## Controls checked and working

- **Crypto:**
  - Argon2id (64 MiB, 3 passes) in the browser, then HKDF to split the auth key from the encryption key.
  - AES-256-GCM with a random IV each time, the item ID as associated data, 256-byte padding, and versioned blobs.
  - A pinned test vector protects existing vaults from format changes.
  - The server rejects weak KDF settings, and the browser refuses them from the server.
- **Authentication:**
  - The server hashes auth keys again with Argon2id.
  - Unknown emails get the same responses and timing as wrong passwords, and stable fake salts.
- **Sessions:**
  - 256-bit random tokens, stored only as SHA-256.
  - The cookie is `__Host-`, `Secure`, `HttpOnly` and `SameSite=Strict`, and lasts 14 days.
  - Changing the password ends every other session.
- **Requests:**
  - Changes must come from the app's own origin.
  - Every body and parameter is checked against a schema.
  - Request size is capped, and errors never reveal internals.
- **Browser:**
  - A strict CSP with Trusted Types.
  - Keys live only in memory, and locking clears them, as the heap test checks.
  - The clipboard is cleared, links are limited to `http` and `https`, and nothing sensitive goes in browser storage.
- **Deployment:**
  - HTTPS only, with HSTS.
  - The app container runs as non-root, read-only, and with no capabilities. Postgres isn't reachable from outside.
  - Request logs contain no bodies and no IP addresses.
  - Backup and restore were tested end to end.

## Before public launch (Phase 8)

An independent security audit with a published report, a vulnerability disclosure policy and `security.txt`, email verification, a CAPTCHA on sign-up and repeated login failures, and published release hashes.
