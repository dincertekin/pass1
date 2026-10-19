import { createHmac, timingSafeEqual } from "node:crypto";

// Checks the Paddle-Signature header on a webhook, so only Paddle can change someone's plan.
//
//   Paddle-Signature: ts=1671552777;h1=eb4d0dc8…
//
// h1 is HMAC-SHA256 of "<ts>:<raw body>" with the webhook's secret. While Paddle rotates the
// secret there can be more than one h1; any one matching is enough.
// Docs: https://developer.paddle.com/webhooks/signature-verification

/** Events older than this are refused, so a captured request can't be replayed later. */
const MAX_AGE_SECONDS = 5 * 60;

export function verifyPaddleSignature(header: string | undefined, rawBody: string, secret: string, now = Date.now()): boolean {
  if (!header) return false;

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const [key, value] = part.split("=", 2);
    if (key === "ts") timestamp = value;
    if (key === "h1" && value) signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest();
  return signatures.some((signature) => {
    const given = Buffer.from(signature, "hex");
    // Same length first: timingSafeEqual throws otherwise. Comparing in constant time means the
    // response time doesn't hint at how many bytes of a forged signature were right.
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
