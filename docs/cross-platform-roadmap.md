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
- [x] **Design tokens shared by every app.** Colors, fonts and corner radii live in `packages/core/src/design-tokens.ts` as plain values, so the phone app and the web app look like the same product. The web's `tokens.css` is generated from them (`npm run tokens`), and a test fails if it's out of date. Spacing follows Tailwind's scale on the web; the phone app can reuse the same numbers.
- [x] **Accessibility as a test, not a hope.** axe-core checks every main screen against WCAG 2.1 AA in the browser tests, in light and dark mode, on desktop and phone. It only runs in tests and never ships. Phase 4 adds VoiceOver and TalkBack checks.

**Done when:** `apps/web` has no crypto or vault logic of its own, and the conformance suite passes on Node and in the browser.

Translations moved to the start of Phase 4 (22 November 2026). With English as the only language, moving a few hundred strings into message files would change nothing anyone sees, and the desktop app in Phase 3 reuses the web's strings anyway. The phone app brings the second set of screens, so that's when one shared message file pays off. If a second language is wanted sooner, do it then.

### Phase 2: An API that apps can use (M)

The API was built for one browser on one origin. Native apps have no origin and handle cookies poorly.

- [x] **Token sign-in for apps.** Apps send the session token in an `Authorization` header and keep it in the iOS Keychain or Android Keystore. The web keeps its `__Host-` cookie.
  - The Origin check exists to stop other sites using the cookie (CSRF). Keep it for every request that carries the cookie. Requests with a header token can't be forged that way, so they don't need it.
- [x] **Device names from the app**, not from the user agent, for the sessions list. Still no IP addresses.
- [x] **A minimum supported app version.** Old mobile apps stay installed for years. The API must be able to say "please update" before a crypto or API change breaks them.
- [x] **API versioning.** Decided: `/api` is version 1, and apps identify themselves with a `Pass1-Client: ios/1.4.0` header. Below the minimum in `packages/shared/src/app-versions.ts`, the server answers 426 and the app asks to be updated. A breaking change goes to `/api/v2/` while `/api` keeps serving older apps. Renaming every path to `/api/v1/` now, with the web as the only client, would be churn for nothing.
- [x] Rate limits and the login throttle apply to apps exactly as to the web (per IP, and per account for logins).
- [x] **Able to run on more than one server.** Cheap to do now, painful to do during an outage:
  - Rate limits and the login block live in Postgres (accepted risk C), with IPs and emails stored only as keyed hashes. Postgres, not Redis: it's already there and backed up.
  - Migrations take a Postgres advisory lock, so servers starting together migrate one at a time. Without it, a test showed all but one crashing at startup. A separate deploy step wasn't needed.
  - The hourly cleanup runs on every server without a lock: deleting expired rows gives the same result however many servers do it.
  - Nothing else is kept in a server's memory between requests. Tests run two API servers on one database and check that the login block and rate limits hold across both.

**Done when:** an API test signs in with a token, syncs and signs out, a cookie request without a matching Origin is still refused, and two API instances behind one address pass the API test suite.

### Phase 3: Desktop app with Electron (M)

The cheapest native app, because it reuses the web build.

- [x] Electron loads the web build from inside the app through a custom protocol (`app://pass1`). It never loads remote pages.
- [x] Hardening, each item checked by a test or at startup:
  - `contextIsolation` on, `sandbox` on, `nodeIntegration` off, no `remote` module.
  - Electron fuses: no `RunAsNode`, no `NODE_OPTIONS`, no `--inspect`, ASAR integrity checked and app code only from the archive, cookie encryption on. Set by `apps/desktop/package.mjs`.
  - Navigation and new windows blocked; links open in the system browser, `http` and `https` only.
  - The same CSP as the web, now defined once in `@pass1/shared`. Stricter than planned: the page connects to nothing but its own files, because API requests go through the main process.
  - A tiny preload bridge exposing two functions: send an API request (validated, kept inside the server's `/api`) and hear about locking. The session token stays in the main process, encrypted by the OS keychain, so the page never sees it.
- [x] Lock the vault when the computer sleeps or the screen locks.
- [ ] Optional unlock with Touch ID or Windows Hello (same design as Phase 4's biometric unlock).
- [ ] Signed and notarized builds for macOS, signed for Windows, AppImage and `.deb` for Linux. Auto-update checks signatures before installing. Unsigned builds for this computer's platform work today (`npm run package -w @pass1/desktop`); signing waits for paid certificates (decided 27 November 2026).
- [x] The heap test from the web e2e suite, run against the desktop app.
- [ ] A first-run screen to choose the server. Today the address comes from `PASS1_SERVER_URL` or `server.json` in the app's data folder.

**Done when:** a signed build installs on all three systems, syncs with a vault made on the web, and passes the heap test.

### Phase 4: Mobile apps with React Native (L)

- [ ] **Translations, first.** Every UI string goes into one message file per language in `packages/core`, shared by the web and phone apps, before the phone screens are written. Dates and numbers through `Intl`, so no library is needed. The server's error messages are shown in the app's language from their error codes.
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
