import { MAILPIT_URL } from "./tests/mailpit";

// Fails fast with instructions, instead of every test timing out while waiting for email.
export default async function checkMailpitIsRunning() {
  try {
    await fetch(`${MAILPIT_URL}/api/v1/info`);
  } catch {
    throw new Error(`Mailpit isn't reachable at ${MAILPIT_URL}. The browser tests read sign-up emails from it. Start it with: npm run mail:dev`);
  }
}
