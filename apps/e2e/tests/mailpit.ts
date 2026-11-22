import { expect } from "@playwright/test";

// The browser tests sign up for real: the API sends email over SMTP to Mailpit, a local mail
// catcher, and the tests read it through Mailpit's HTTP API. Start it with `npm run mail:dev`.

export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";
const POLL_INTERVAL_MS = 200;
const WAIT_FOR_EMAIL_MS = 10_000;

interface Email {
  subject: string;
  text: string;
}

/**
 * Waits for the newest email to an address. Input: the address and how many emails it should
 * have had by now (so a second email isn't mistaken for the first). Output: subject and text.
 */
export async function waitForEmailTo(address: string, expectedCount = 1): Promise<Email> {
  const query = encodeURIComponent(`to:"${address}"`);
  let newestId: string | null = null;
  await expect
    .poll(
      async () => {
        const search = await (await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`)).json();
        newestId = search.messages_count >= expectedCount ? search.messages[0].ID : null;
        return newestId;
      },
      { timeout: WAIT_FOR_EMAIL_MS, intervals: [POLL_INTERVAL_MS] },
    )
    .not.toBeNull();
  const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${newestId}`)).json();
  return { subject: message.Subject, text: message.Text };
}

/** Input: an email's text. Output: the sign-up link in it, or null. */
export function signupLinkIn(text: string): string | null {
  return text.match(/https?:\/\/\S+\/register#token=[A-Za-z0-9_-]{43}/)?.[0] ?? null;
}
