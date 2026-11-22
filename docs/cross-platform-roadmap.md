# Cross-platform roadmap

Goal: pass1 on the web, iOS, Android, macOS, Windows and Linux, feeling like a native app on each, without weakening what the web app already gets right.

Order of priority for every decision below: **security, then privacy, then speed.** When two of them conflict, the earlier one wins, and the tradeoff is written down in [security-review.md](security-review.md).

Starting point (19 November 2026): the web app, API and database are built. Typecheck is clean and all 180 unit and API tests pass. The Playwright browser tests weren't part of this check.

## Decisions this roadmap makes

The TODO lists React Native for web, mobile and desktop, a Node.js backend, a good database, RevenueCat and Electron. Here is what each becomes, and why.

| TODO item | Decision | Why |
|---|---|---|
| Node.js backend | **Keep the Fastify API.** Extend it for apps (Phase 2). | It exists, is tested and has had a security review. |
| A good database | **Keep Postgres.** | It's already there, with migrations, row locks and tested backups. Nothing in this plan needs a different database. |
| React Native for **web** | **Don't.** Keep the current React web app. | The web app's strict CSP, Trusted Types and heap tests took real work. React Native Web injects styles at runtime and adds a large layer the security review hasn't seen. We share logic between apps, not UI. |
| React Native for **mobile** | **Yes**, with Expo (development builds, so we can add native modules). | One codebase for iOS and Android, in the TypeScript we already write, and it can use our shared packages directly. |
| React Native for **desktop** | **No.** Use Electron instead. | React Native for macOS and Windows covers fewer platforms (no Linux) and has a smaller community. |
| Electron for desktop | **Yes**, running the existing web app **from files inside the signed app**, never loaded from the server. | Same Chromium everywhere, so the CSP and heap tests carry over. Bundling the code also fixes accepted risk D (see below). |
| RevenueCat | **Yes, for App Store and Google Play purchases only.** Paddle stays for web and desktop. | Apple and Google require their own payments for subscriptions bought inside an app. RevenueCat handles both stores and their receipts. |

### The biggest security win of going native

Today, accepted risk **D** says a compromised server could send malicious JavaScript that reads vaults. Every web password manager has this problem. Native apps and the desktop app ship their code **signed, inside the app**. The server only ever sends ciphertext, so a compromised server can no longer change the code that decrypts the vault. We should tell people this: "for the strongest protection, use an app."

## Phases

Each phase ends with something that works and can be released. Size is a rough guess: S is days, M is a few weeks, L is a month or more.

### Phase 0: Solid ground (S)

Before building on it, prove the web app is ready.

- [x] Run `npm run test:e2e` and fix anything that fails. (All passed; CI already runs them on every push.)
- [ ] One real Paddle sandbox checkout (already on the README roadmap).
- [x] Sign-up CAPTCHA: a self-hosted proof-of-work puzzle solved in a Web Worker. No third-party script runs where vaults are decrypted. It doesn't replace the login block (accepted risk B), because a puzzle only costs computing time and the block caps guesses.
- [x] Email verification (closes accepted risk A), sent over SMTP: any provider, or the self-hoster's own. Sign-up starts with the email; the emailed link opens the page that creates the vault.
- [x] Incremental sync instead of `GET /api/vault/items` returning everything (accepted risk F). Phones on slow networks need this, and so does the offline cache later.

**Done when:** browser tests pass in CI, and a test card upgrades a sandbox account.

### Phase 1: Make the core portable (M)

Mobile apps can't use code that touches `window`, `document` or `crypto.subtle` directly. Pull the logic out of `apps/web` so every app uses the same tested code.

- [x] **A crypto provider interface** in `packages/crypto`: Argon2id, HKDF-SHA256, AES-256-GCM and secure random, behind one small interface. The web keeps Web Crypto and `hash-wasm`. Mobile gets native implementations (Phase 4).
  - Trap: React Native's JavaScript engine (Hermes) has no `crypto.subtle` and can't run WebAssembly like a browser, so `hash-wasm` won't run there as it is.
- [x] **A conformance test suite** that runs the pinned test vector, and a few hundred random round trips, against *any* provider. Every platform must pass it before it touches a real vault. This is the most important test in the whole plan: a provider that encrypts slightly differently breaks vaults across devices.
- [x] **`packages/core`** for logic with no browser in it: vault entries and search, password health, importers (Chrome, Bitwarden, 1Password...), sync, the API client. The generator stays in `@pass1/crypto` and plan limits in `@pass1/shared`, which every app can already use.
- [x] The web app uses the new packages, and its tests still pass unchanged.
- [ ] **Translations.** Every UI string is hard-coded English today. Move them into one message file per language, shared by web, desktop and mobile, before there are three apps to change. Dates and numbers through `Intl`, so no library is needed.
- [x] **Design tokens shared by every app.** Colors, fonts and corner radii live in `packages/core/src/design-tokens.ts` as plain values, so the phone app and the web app look like the same product. The web's `tokens.css` is generated from them (`npm run tokens`), and a test fails if it's out of date. Spacing follows Tailwind's scale on the web; the phone app can reuse the same numbers.
- [ ] **Accessibility as a test, not a hope.** Keyboard and screen reader checks in the e2e tests (axe has no runtime dependency in the app). Phase 4 adds VoiceOver and TalkBack checks.

**Done when:** `apps/web` has no crypto or vault logic of its own, the conformance suite passes on Node and in the browser, and no UI string is left outside the message files.

### Phase 2: An API that apps can use (M)

The API was built for one browser on one origin. Native apps have no origin and handle cookies poorly.

- [ ] **Token sign-in for apps.** Apps send the session token in an `Authorization` header and keep it in the iOS Keychain or Android Keystore. The web keeps its `__Host-` cookie.
  - The Origin check exists to stop other sites using the cookie (CSRF). Keep it for every request that carries the cookie. Requests with a header token can't be forged that way, so they don't need it.
- [ ] **Device names from the app**, not from the user agent, for the sessions list. Still no IP addresses.
- [ ] **A minimum supported app version.** Old mobile apps stay installed for years. The API must be able to say "please update" before a crypto or API change breaks them.
- [ ] **API versioning** (`/api/v1/`), so the web and the apps can change at different speeds.
- [ ] Rate limits and the login throttle apply per account and per token, the same as for the web.
- [ ] **Able to run on more than one server.** Cheap to do now, painful to do during an outage:
  - Rate limits and the login block move from memory into Postgres (accepted risk C). Postgres first, because it's already there and backed up. Redis only if load tests show Postgres can't keep up.
  - Migrations become a separate deploy step instead of running when each app starts (`apps/api/src/db/client.ts` already warns about this).
  - The hourly session cleanup takes a Postgres advisory lock, so only one server runs it.
  - Nothing else kept in a server's memory between requests. A test starts two API instances on one database and checks that the login block holds across both.

**Done when:** an API test signs in with a token, syncs and signs out, a cookie request without a matching Origin is still refused, and two API instances behind one address pass the API test suite.

### Phase 3: Desktop app with Electron (M)

The cheapest native app, because it reuses the web build.

- [ ] Electron loads the web build from inside the app through a custom protocol (for example `app://pass1`). It never loads remote pages.
- [ ] Hardening, each item checked by a test or at startup:
  - `contextIsolation` on, `sandbox` on, `nodeIntegration` off, no `remote` module.
  - Electron fuses: no `RunAsNode`, no `NODE_OPTIONS`, ASAR integrity checked, cookie encryption on.
  - Navigation and new windows blocked; links open in the system browser, `http` and `https` only.
  - The same CSP as the web, with `connect-src` limited to the user's server.
  - A tiny preload bridge exposing only what's needed (keychain, lock on sleep), each call validated.
- [ ] Lock the vault when the computer sleeps or the screen locks.
- [ ] Optional unlock with Touch ID or Windows Hello (same design as Phase 4's biometric unlock).
- [ ] Signed and notarized builds for macOS, signed for Windows, AppImage and `.deb` for Linux. Auto-update checks signatures before installing.
- [ ] The heap test from the web e2e suite, run against the desktop app.

**Done when:** a signed build installs on all three systems, syncs with a vault made on the web, and passes the heap test.

### Phase 4: Mobile apps with React Native (L)

- [ ] **Native crypto:** a maintained native module for AES-GCM and HKDF, and a native Argon2id built from the reference C implementation. Both must pass the Phase 1 conformance suite on real iOS and Android devices. Check how fast Argon2id (64 MiB, 3 passes) runs on an old, cheap Android phone. Don't lower the settings to make it faster.
- [ ] Screens built in React Native, using `packages/core`. Follow each platform's conventions (navigation, sheets, haptics, Dynamic Type, dark mode). This is where "feels native" comes from.
- [ ] **Biometric unlock (optional, off by default).** The vault key is wrapped by a key kept in the Secure Enclave (iOS) or StrongBox/TEE (Android), usable only after Face ID or a fingerprint. Adding a new fingerprint or face invalidates it, so the master password is needed again. This changes the threat model: someone with your phone and your face can unlock it. Write that down before shipping.
- [ ] **Encrypted offline cache.** The vault, still encrypted, saved on the device so it opens without a network. Write conflicts are already handled by revision numbers.
- [ ] Hide the vault in the app switcher, block screenshots on secret screens (`FLAG_SECURE` on Android), and mark copied passwords as sensitive with an expiry.
- [ ] Lock when the app goes to the background, after the auto-lock time.
- [ ] Certificate pinning: decide (see open questions).

**Done when:** TestFlight and Play internal test builds pass the conformance suite on devices, and a vault created on the web opens offline on a phone.

### Phase 5: Autofill (L)

A password manager feels native when it fills passwords in other apps. React Native can't do this part: each one is a small native extension.

- [ ] **iOS:** an AutoFill Credential Provider extension in Swift. App extensions get much less memory than the app, so running Argon2id there may fail. The extension should use the biometric-wrapped key from Phase 4 through a shared Keychain group instead of deriving keys again.
- [ ] **Android:** an Autofill Service in Kotlin, matching app package names and web domains against item URLs.
- [ ] **Desktop and web:** the browser extension (already on the README roadmap). It reuses the web build and `packages/core`, and is its own code-signed app like the others.
- [ ] Later: passkeys stored in the vault (iOS 17+ and Android 14+ let password managers provide them).

**Done when:** pass1 fills a login in a third-party app on both iOS and Android.

### Phase 6: Payments in the apps (M)

- [ ] RevenueCat with App Store and Google Play products that match [plans.md](plans.md).
- [ ] RevenueCat webhooks (signature checked, applied once, in order, like Paddle's) update the **same** plan record. One account, one plan, wherever it was bought.
- [ ] **Privacy:** RevenueCat gets a random ID per account, never the email. Turn off its optional attribution and analytics features.
- [ ] Someone who pays on the web is Plus in the app too, and the other way round. Store rules about mentioning web prices change often and differ by country. Check them when building this.

**Done when:** a sandbox purchase on each store, and a Paddle purchase, both show as Plus in every app.

### Phase 7: Release and trust (M)

- [ ] **The independent audit covers the apps too:** crypto providers, token auth, Electron hardening, biometric unlock and autofill extensions. Plan it after Phase 5, not before Phase 3.
- [ ] Reproducible builds and published hashes for the web, desktop and extension.
- [ ] App Store privacy label and Google Play data safety form. Short ones, since we collect little. They must match the README threat model exactly.
- [ ] Update the README threat model and FAQ ("Does it work on my phone?").

## Scaling the server

Zero knowledge makes pass1 easier to scale than most apps. The server stores encrypted blobs and never decrypts them, so it does very little work per request. The expensive work (Argon2id, encryption, search) happens on people's devices.

Each step below has a trigger: do it when the trigger happens, not before. Building for a million users while there are a hundred costs money and adds parts the audit has to cover.

| Step | Trigger | What to do |
|---|---|---|
| **Measure** | Before Phase 3 | Load test with k6 against a copy of production: logins, sync and saves, with realistic vault sizes. Write down how many logins per second one server handles. That number decides everything below. |
| **Logins** | Load test shows logins limit us | Each login runs Argon2id on the server (19 MiB, 2 passes, in `apps/api/src/auth/password.ts`). It's the most expensive thing the server does, and it runs on Node's small thread pool. Tune `UV_THREADPOOL_SIZE` and server memory. Never lower the Argon2 settings to go faster. |
| **More API servers** | One server above about 60% CPU at peak, or needing zero-downtime deploys | Two or more app containers behind Caddy. Phase 2 already made this safe. |
| **Database connections** | Several API servers running out of Postgres connections | PgBouncer in front of Postgres. |
| **Backups you can rewind** | Paying users | Point-in-time recovery (WAL archiving, for example with pgBackRest) instead of only a daily dump, so a bad deploy loses minutes of data, not a day. Encrypted, stored off the server. |
| **File attachments** | When the paid feature is built | Files are encrypted on the device like items, then stored in S3-compatible object storage, not Postgres. The server hands out short-lived upload and download links. The storage provider sees only ciphertext and sizes. |
| **Managed Postgres** | Operating the database takes more time than building | A managed Postgres in the EU. It only ever holds ciphertext, emails and hashes, but pick a provider whose privacy terms we'd be happy to publish. |
| **Monitoring** | Before the hosted service opens | Self-hosted error tracking (GlitchTip) and metrics (Prometheus and Grafana), with the rules from accepted risk J: no request bodies, headers, cookies, IPs or URLs with IDs. |

What we deliberately **won't** do, even for speed:

- **No third-party CDN for app code.** Whoever serves the JavaScript can read vaults (accepted risk D). The web app keeps being served from our own servers. Apps don't need a CDN, since their code is inside them.
- **No push notifications carrying data.** Apple and Google would see when and how often a vault changes. Apps sync when opened and on a timer. If push is ever added, messages are empty "something changed" pings.
- **No multi-region setup** until people ask for it. With an offline cache on every device, distance to the server barely matters for a password manager.

## Costs to know before starting

Prices change. Check them when you sign up.

| What | Roughly |
|---|---|
| Apple Developer Program (iOS, macOS signing and notarization) | $99 a year |
| Google Play developer account | $25 once |
| Windows code signing | From about $10 a month (Azure signing service) to a few hundred dollars a year (certificate) |
| RevenueCat | Free up to a revenue threshold, then a percentage of revenue |
| Expo build service (optional, builds can run on our own Mac) | Free tier, paid plans monthly |
| A Mac | Required to build and sign iOS and macOS apps |
| Servers, at first | One server with 2 to 4 GB of RAM, like today. Load testing tells us when to add more |
| Object storage for attachments | Charged per GB stored and downloaded. Small for encrypted password files |

## Open questions

- **Tauri instead of Electron?** Much smaller apps and a smaller attack surface, but it uses Safari's engine on macOS and WebKitGTK on Linux, so the CSP and heap tests need redoing per platform. Electron is recommended because the existing tests carry over. Decide at the start of Phase 3.
- **Certificate pinning in the apps?** It protects against a mis-issued certificate. The risk is that self-hosters bring their own certificates, and a wrong pin locks everyone out. One option: pin only for the hosted service.
- **Self-hosted servers in the apps:** let people enter their own server URL? It's natural for an open-source project, but adds a screen where phishing could happen ("enter this server URL").
- **Root and jailbreak detection:** warn, block, or ignore? It's easy to bypass and blocks legitimate users. Leaning toward a warning only.
