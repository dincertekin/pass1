import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { deleteExpiredChallenges } from "./auth/proof-of-work.js";
import { deleteExpiredSessions } from "./auth/sessions.js";
import { deleteExpiredSignupRequests } from "./auth/signup.js";
import { deleteStaleLoginFailures } from "./auth/login-throttle.js";
import { openDatabase } from "./db/client.js";
import { deleteEndedRateLimitWindows } from "./rate-limit-store.js";
import { loginFailureRule } from "./rate-limits.js";

const config = loadConfig();
// The app's logger doesn't exist yet when the database opens, so the handler looks it up later.
let app: Awaited<ReturnType<typeof buildApp>> | null = null;
const { db, close } = await openDatabase(config.DATABASE_URL, {
  onConnectionLost: (error) => app?.log.warn({ err: error }, "lost an idle database connection; the next query reconnects"),
});
app = await buildApp({ config, db });

app.listen({ port: config.PORT, host: config.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

// Rows that have expired are useless; remove them once an hour. Every API server runs this, which
// is safe without coordination: deleting what has already expired gives the same result however
// many servers do it. unref() lets the process exit anyway.
const ONE_HOUR = 60 * 60 * 1000;
const CLEANUP_JOBS: [what: string, run: () => Promise<number>][] = [
  ["expired sessions", () => deleteExpiredSessions(db)],
  ["expired sign-up challenges", () => deleteExpiredChallenges(db)],
  ["expired sign-up requests", () => deleteExpiredSignupRequests(db)],
  ["stale login failure counts", () => deleteStaleLoginFailures(db, loginFailureRule(config))],
  ["ended rate limit windows", () => deleteEndedRateLimitWindows(db)],
];
setInterval(() => {
  for (const [what, run] of CLEANUP_JOBS) {
    run().then(
      (count) => count > 0 && app.log.info({ count }, `deleted ${what}`),
      (err) => app.log.error(err, `deleting ${what} failed`),
    );
  }
}, ONE_HOUR).unref();

// Docker sends SIGTERM on stop: finish in-flight requests, then close the database cleanly.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    await app.close();
    await close();
    process.exit(0);
  });
}
