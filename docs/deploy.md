# Deploying pass1

pass1 runs on one Linux server as four Docker containers, all defined in [`compose.yaml`](../compose.yaml):

| Service | What it does |
|---|---|
| `caddy` | Serves HTTPS on ports 80 and 443, gets and renews the certificate automatically |
| `app` | The pass1 API and web app (built from the [`Dockerfile`](../Dockerfile)) |
| `db` | Postgres 18. Its data lives in the `db-data` Docker volume |
| `backup` | Dumps the database once a day into `./backups` and keeps 14 days |

The server never sees vault contents or master passwords. A stolen server or backup holds emails, Argon2 hashes, session token hashes and encrypted vaults. Protect it anyway.

## What you need

- A Linux server with 2 GB of RAM or more, with Docker Engine and the Compose plugin installed (`docker compose version` should work).
- A domain name whose DNS `A` (and `AAAA`, for IPv6) record points at the server.
- Ports 80 and 443 open to the internet. Caddy needs port 80 to get the certificate and to redirect to HTTPS.

## First deploy

```bash
git clone <your pass1 repository> pass1 && cd pass1

cp deploy/.env.example .env
chmod 600 .env
# Edit .env: set DOMAIN and PUBLIC_URL, and fill both secrets with:
openssl rand -base64 32

docker compose up -d --build
```

Check it:

```bash
docker compose ps                        # app and db should say "(healthy)"
curl https://<your domain>/api/health    # {"status":"ok"}
```

Then open the site, create an account, and add an item. The database migrations run by themselves when the app starts.

> **Never change `PRELOGIN_SECRET` after launch.** It's used to answer logins for unknown emails the same way every time, so that nobody can find out which emails have accounts. Changing it changes those answers.

## Backups

The `backup` service writes `backups/pass1-<date>.dump` once a day and deletes dumps older than 14 days. It skips the dump while the database has no accounts. Otherwise, after a disaster, a freshly started server would write the newest backup, and that one would be empty.

Take one now, for example before an upgrade:

```bash
docker compose run --rm backup --once
```

**Copy backups off the server.** A backup on the same disk is gone when the disk is. Encrypt them first. For example, with [age](https://github.com/FiloSottile/age) and [rclone](https://rclone.org), from cron once a day:

```bash
for f in backups/*.dump; do
  [ -f "$f.age" ] || age --recipient "<your age public key>" --output "$f.age" "$f"
done
rclone copy backups --include '*.age' remote:pass1-backups
```

Keep the age private key somewhere other than the server. Without it, those copies can't be restored.

## Restoring a backup

```bash
ls -lh backups/                                  # choose the file deliberately; check its date and size
deploy/restore.sh backups/pass1-<date>.dump      # asks you to type "restore"
```

The script stops the app, replaces the database with the backup and starts the app again. Everyone stays logged in only if their session was in the backup. Otherwise they log in again, with the same master password as before.

**Practise this.** Every few months, restore the latest backup on a spare server or your own computer (see "Trying it on your own computer") and log in. A backup that has never been restored isn't known to work.

## Upgrading

```bash
docker compose run --rm backup --once   # a fresh backup first
git pull
docker compose up -d --build
docker compose ps                       # wait for "(healthy)"
```

Database migrations run when the new app starts. If something is wrong, check out the previous version, rebuild, and restore the backup you just took.

## Billing with Paddle

Without the Paddle settings, pass1 runs with the Free plan only, and the plans dialog says upgrades open soon. To take payments:

1. **Start in the sandbox.** Make an account at [sandbox-vendors.paddle.com](https://sandbox-vendors.paddle.com) and keep `PADDLE_ENVIRONMENT=sandbox` until everything below works with Paddle's test cards.
2. **Products and prices.** Under *Catalog → Products*, create *pass1 Plus* with a yearly price ($19) and a monthly one ($2.49), and *pass1 Unlimited* with $39 yearly and $4.49 monthly. Put the four `pri_…` IDs in `.env`.
3. **The checkout domain.** Pick a subdomain such as `pay.pass1.example.com`, point its DNS at the server and set `CHECKOUT_DOMAIN`. Caddy serves `apps/checkout/` there. Paddle's script runs only on that page, never on the app's origin where vaults are decrypted.
4. **Default payment link.** Under *Checkout → Checkout settings*, set the default payment link to `https://<CHECKOUT_DOMAIN>/`, and approve that domain if Paddle asks.
5. **API key and client token.** Under *Developer tools → Authentication*, create an API key (permissions: transactions write, customers read and write, customer portal sessions write, subscriptions write) and a client-side token. Put them in `PADDLE_API_KEY` and `PADDLE_CLIENT_TOKEN`.
6. **Webhook.** Under *Developer tools → Notifications*, add a destination with URL `https://<DOMAIN>/api/billing/webhook` and the events `subscription.created`, `subscription.updated`, `subscription.activated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused` and `subscription.resumed`. Put its secret key in `PADDLE_WEBHOOK_SECRET`.
7. `docker compose up -d` and try it: upgrade with a test card, check that the sidebar shows the new plan, open *Manage subscription*, cancel, and check that the account goes back to Free when the period ends. Paddle's notification log shows each delivery and its response.
8. **Going live.** Repeat steps 2 to 6 in the live Paddle dashboard (sandbox IDs and keys don't work there), set `PADDLE_ENVIRONMENT=production`, and restart. pass1 refuses to start in production with sandbox settings.

How it works: the server creates a Paddle transaction for the chosen price and sends the browser to its checkout on the checkout domain. Paddle then reports the subscription to the webhook, which is the only thing that changes a user's plan. Webhook requests are checked against their signature, applied once even when delivered twice, and ignored when they arrive out of order. Deleting an account cancels its subscription first.

## Monitoring

- **Uptime:** point an uptime checker (UptimeRobot, Better Stack, a cron job with `curl`) at `https://<your domain>/api/health`. It returns 200 only when the app and the database both work, and 503 when the database is down.
- **Logs:** `docker compose logs -f app` shows one JSON line per request: method, URL, status and time taken. Request bodies are never logged, because they carry auth keys and encrypted vault data. Caddy's logs: `docker compose logs -f caddy`.
- **Health:** `docker compose ps` shows Docker's own health check for `app` and `db`. Containers restart by themselves when they crash.
- **Disk:** watch free space for Postgres and `backups/`. `docker system df` shows what Docker uses.

## Server security checklist

- Allow only SSH, 80 and 443 through the firewall (`ufw allow 22,80,443/tcp`). Postgres and the app are never exposed; only Caddy has ports.
- Log in with SSH keys, not passwords.
- Turn on automatic security updates for the OS (`unattended-upgrades` on Debian and Ubuntu).
- Keep `.env` readable only by its owner (`chmod 600 .env`).
- Keep encrypted backups somewhere other than the server.

## Trying it on your own computer

The same stack runs locally, with a certificate Caddy makes for `localhost`. Your browser will warn about that certificate the first time.

```bash
cat > .env <<'EOF'
DOMAIN=localhost
PUBLIC_URL=https://localhost:8443
POSTGRES_PASSWORD=local-only-password
PRELOGIN_SECRET=local-only-prelogin-secret-at-least-32-chars
HTTP_PORT=8080
HTTPS_PORT=8443
EOF

docker compose up -d --build
open https://localhost:8443
```

Stop it and delete its data with `docker compose down --volumes`.
