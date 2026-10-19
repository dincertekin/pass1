import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaddleSignature } from "./signature.js";

const SECRET = "pdl_ntfset_test_secret";
const BODY = '{"event_id":"evt_1","event_type":"subscription.created"}';
const NOW = 1_800_000_000_000;
const ts = Math.floor(NOW / 1000);

function h1(body: string, secret = SECRET, at = ts) {
  return createHmac("sha256", secret).update(`${at}:${body}`).digest("hex");
}

describe("verifyPaddleSignature", () => {
  it("accepts Paddle's signature over the exact body", () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${h1(BODY)}`, BODY, SECRET, NOW)).toBe(true);
  });

  it("rejects a body changed by even one character", () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${h1(BODY)}`, BODY.replace("created", "canceled"), SECRET, NOW)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${h1(BODY, "wrong")}`, BODY, SECRET, NOW)).toBe(false);
  });

  it("accepts any matching h1 while Paddle rotates secrets", () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${h1(BODY, "old")};h1=${h1(BODY)}`, BODY, SECRET, NOW)).toBe(true);
  });

  it("refuses old events, so a captured request can't be replayed", () => {
    const old = ts - 6 * 60;
    expect(verifyPaddleSignature(`ts=${old};h1=${h1(BODY, SECRET, old)}`, BODY, SECRET, NOW)).toBe(false);
  });

  it("refuses missing or malformed headers", () => {
    for (const header of [undefined, "", "h1=abc", `ts=${ts}`, `ts=abc;h1=${h1(BODY)}`, `ts=${ts};h1=zz`]) {
      expect(verifyPaddleSignature(header, BODY, SECRET, NOW)).toBe(false);
    }
  });
});
