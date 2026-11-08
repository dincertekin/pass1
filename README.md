<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <img alt="pass1: passwords only you can read. Encrypted in your browser before they're sent; the server only stores ciphertext it can't open." src="docs/assets/banner-light.svg" width="100%">
</picture>

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/dincertekin/dincertekin/main/assets/badges/typescript-dark.svg"><img src="https://raw.githubusercontent.com/dincertekin/dincertekin/main/assets/badges/typescript-light.svg" alt="TypeScript" height="28"></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/dincertekin/dincertekin/main/assets/badges/react-dark.svg"><img src="https://raw.githubusercontent.com/dincertekin/dincertekin/main/assets/badges/react-light.svg" alt="React" height="28"></picture>
  <a href="docs/deploy.md"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/dincertekin/dincertekin/main/assets/badges/self-hosted-dark.svg"><img src="https://raw.githubusercontent.com/dincertekin/dincertekin/main/assets/badges/self-hosted-light.svg" alt="Self-hosted" height="28"></picture></a>
  <a href="LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/dincertekin/dincertekin/main/assets/badges/mit-dark.svg"><img src="https://raw.githubusercontent.com/dincertekin/dincertekin/main/assets/badges/mit-light.svg" alt="MIT license" height="28"></picture></a>
</p>

<p align="center">
  <b>Passwords only you can read.</b><br>
  A zero-knowledge, open-source password manager that runs in your browser.
</p>

<p align="center">
  <a href="#how-it-works">How it works</a> ·
  <a href="#threat-model">Threat model</a> ·
  <a href="#questions">Questions</a> ·
  <a href="docs/deploy.md">Self-hosting</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#would-you-like-to-support-pass1">Support</a>
</p>

---

pass1 is a **zero-knowledge password manager** for the web. Your vault is encrypted in the browser before it is sent anywhere, so the server only ever stores ciphertext it cannot read.

- **Private:** encrypted on your device, with site names and URLs encrypted too. The server can't read your vault.
- **Simple:** a clean vault with search, favorites, a password generator and password health checks.
- **Careful:** standard cryptography only (Argon2id, AES-256-GCM), a strict Content Security Policy, and a published security review.
- **Yours:** open source, and you can host it on your own server.

> 🚧 Work in progress. See the [roadmap](#roadmap).

![The pass1 vault: a list of logins with password health badges, and one item open](docs/assets/screenshot-vault.png)

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screenshot-register.png" alt="Creating a vault: a master password strength meter and a warning that there is no password reset"></td>
    <td>Creating a vault. There is no password reset, because the server never sees the master password.<br><br><sub>Screenshots use demo data.</sub></td>
  </tr>
</table>

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

## Questions

**Can the pass1 server read my passwords?**
No. Your vault is encrypted in your browser with a key derived from your master password, which never leaves your device. The server stores only ciphertext (item names and websites included) and can't decrypt it. See [How it works](#how-it-works) and the [threat model](#threat-model).

**What happens if I forget my master password?**
Your vault can't be recovered, by anyone. There is no reset, because the server never knows your master password. Choose a long passphrase you'll remember, and keep a copy somewhere safe.

**Is pass1 safe to use today?**
It's a work in progress. The whole app has had a security review, with every finding fixed or written down in [docs/security-review.md](docs/security-review.md), but it hasn't had an independent audit yet. That's on the [roadmap](#roadmap).

**Can I host it myself?**
Yes. It runs on one Linux server with Docker Compose: HTTPS, the app, Postgres and daily backups. See [Deploying pass1](docs/deploy.md).

**Can I import my passwords from another password manager?**
Yes: from Chrome, Edge, Safari, Bitwarden and 1Password, and from pass1's own encrypted export.

**Does it work on my phone?**
Yes, in your phone's browser: the vault rearranges itself for small screens. There's no browser extension yet; it's on the roadmap.

**Is it free?**
The code is open source under the MIT license, and hosting it yourself costs nothing. A hosted service with free and paid [plans](docs/plans.md) is being prepared; the paid features aren't built yet.

**How is it different from Bitwarden or 1Password?**
At its core it works the same way: your vault is encrypted on your device. pass1 aims to be small and easy to review: one web app, standard cryptography only, a strict Content Security Policy, and a written threat model that says plainly what it doesn't protect against.

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

The app itself is built: vault, crypto, import and export, sessions, a strict CSP, end-to-end tests, Docker deployment and a security review. The full list is in [What's built](docs/progress.md). Next:

- [ ] One real checkout through Paddle's sandbox ([docs/deploy.md](docs/deploy.md#billing-with-paddle))
- [ ] Paid features: TOTP codes, breach report (HIBP k-anonymity), file attachments, emergency access
- [ ] Error tracking (Sentry or similar, with nothing sensitive in reports)
- [ ] Email verification, privacy-friendly CAPTCHA and rate limits on sign-up
- [ ] Landing page that explains the security model in plain words
- [ ] Terms of service and privacy policy
- [ ] `security.txt`, a vulnerability disclosure policy, a status page
- [ ] Reproducible builds, with a published hash of every release
- [ ] TOTP 2FA and passkeys for logging in
- [ ] Browser extension
- [ ] Independent security audit, with the report published

## Contributing

Issues and pull requests are welcome. Start with [Getting started](#getting-started); `npm test` runs everything. Please report security issues privately, as described in [SECURITY.md](SECURITY.md), not in a public issue.

## Would you like to support pass1?

pass1 is open source, and it stays open source. If you find it useful, you can:

- **[Buy me a coffee](https://buymeacoffee.com/dincertekin)**: it keeps the work going.
- **Give it a star** on GitHub, so more people find it.
- **Tell a friend** who still reuses passwords.

Thank you!

## License

[MIT](./LICENSE) © Dinçer Tekin
