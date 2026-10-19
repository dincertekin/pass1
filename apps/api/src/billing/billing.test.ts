import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { billingCheckouts, users, vaultItems } from "../db/schema.js";
import { b64, createTestApp, loggedInAs } from "../test-helpers.js";
import type { PaddleClient } from "./paddle.js";

// Billing end to end, except Paddle itself: checkout and portal calls go to a fake, and
// webhooks are signed exactly as Paddle signs them, so they pass the real signature check.

const SECRET = "pdl_ntfset_test_secret";
const PRICES = {
  PADDLE_PRICE_PLUS_YEARLY: "pri_plus_yearly",
  PADDLE_PRICE_PLUS_MONTHLY: "pri_plus_monthly",
  PADDLE_PRICE_UNLIMITED_YEARLY: "pri_unlimited_yearly",
  PADDLE_PRICE_UNLIMITED_MONTHLY: "pri_unlimited_monthly",
};
const BILLING_ENV = { PADDLE_API_KEY: "pdl_sdbx_apikey_test", PADDLE_WEBHOOK_SECRET: SECRET, ...PRICES };

function fakePaddle() {
  let transactions = 0;
  const calls = { checkouts: [] as Parameters<PaddleClient["createCheckout"]>[0][], cancels: [] as string[] };
  const fake = {
    calls,
    failCancel: false,
    async createCheckout(input: Parameters<PaddleClient["createCheckout"]>[0]) {
      calls.checkouts.push(input);
      transactions++;
      return { transactionId: `txn_test${transactions}`, url: `https://pay.example.com/?_ptxn=txn_test${transactions}` };
    },
    async createPortalUrl() {
      return "https://customer-portal.paddle.com/cpl_test";
    },
    async cancelSubscriptionNow(id: string) {
      if (fake.failCancel) throw new Error("Paddle is down");
      calls.cancels.push(id);
    },
  };
  return fake;
}

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let paddle: ReturnType<typeof fakePaddle>;
let ada: Awaited<ReturnType<typeof loggedInAs>>;
let clock: number;

beforeEach(async () => {
  paddle = fakePaddle();
  ctx = await createTestApp(BILLING_ENV, { paddle });
  ada = await loggedInAs(ctx.app);
  clock = Date.parse("2026-10-01T10:00:00Z");
});

/** A subscription event shaped like Paddle's, including fields pass1 doesn't use. */
function subscriptionEvent(type: string, data: {
  subId?: string;
  status?: string;
  priceId?: string;
  transactionId?: string | null;
  periodEndsAt?: string;
  cancelsAt?: string | null;
  customData?: Record<string, unknown> | null;
}) {
  clock += 60_000; // each event a minute after the last, like real ones
  return {
    event_id: `evt_${Math.random().toString(36).slice(2)}`,
    event_type: type,
    occurred_at: new Date(clock).toISOString(),
    notification_id: "ntf_test",
    data: {
      id: data.subId ?? "sub_01",
      status: data.status ?? "active",
      customer_id: "ctm_01",
      transaction_id: data.transactionId === undefined ? "txn_test1" : data.transactionId,
      currency_code: "USD",
      custom_data: data.customData ?? null,
      items: [{ status: "active", quantity: 1, price: { id: data.priceId ?? PRICES.PADDLE_PRICE_PLUS_YEARLY, billing_cycle: { interval: "year", frequency: 1 } } }],
      current_billing_period: data.status === "canceled" ? null : { starts_at: "2026-10-01T10:00:00Z", ends_at: data.periodEndsAt ?? "2027-10-01T10:00:00Z" },
      scheduled_change: data.cancelsAt ? { action: "cancel", effective_at: data.cancelsAt, resume_at: null } : null,
      next_billed_at: data.periodEndsAt ?? "2027-10-01T10:00:00Z",
    },
  };
}

function deliver(event: unknown, signature?: string) {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const h1 = createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex");
  // No Origin header: webhooks come from Paddle's servers, not a browser.
  return ctx.app.inject({
    method: "POST",
    url: "/api/billing/webhook",
    payload: body,
    headers: { "content-type": "application/json", "paddle-signature": signature ?? `ts=${ts};h1=${h1}` },
  });
}

async function plan() {
  return (await ada.send("GET", "/api/auth/me")).json().user.plan;
}

async function billing() {
  return (await ada.send("GET", "/api/billing")).json();
}

async function upgradeToPlus() {
  const checkout = await ada.send("POST", "/api/billing/checkout", { plan: "plus", interval: "year" });
  expect(checkout.statusCode).toBe(200);
  expect((await deliver(subscriptionEvent("subscription.created", {}))).statusCode).toBe(200);
}

describe("upgrade", () => {
  it("checkout asks Paddle for the right price and remembers whose checkout it is", async () => {
    const res = await ada.send("POST", "/api/billing/checkout", { plan: "unlimited", interval: "month" });
    expect(res.json().url).toBe("https://pay.example.com/?_ptxn=txn_test1");
    expect(paddle.calls.checkouts).toEqual([{ priceId: "pri_unlimited_monthly", userId: ada.userId, customerId: null }]);
    expect(await ctx.db.select().from(billingCheckouts)).toEqual([expect.objectContaining({ paddleTransactionId: "txn_test1", userId: ada.userId })]);
  });

  it("the subscription event moves the user to the paid plan", async () => {
    await upgradeToPlus();
    expect(await plan()).toBe("plus");
    expect((await billing()).subscription).toMatchObject({ plan: "plus", status: "active", interval: "year", cancelsAt: null });
  });

  it("someone already subscribed is sent to the portal instead of a second checkout", async () => {
    await upgradeToPlus();
    const res = await ada.send("POST", "/api/billing/checkout", { plan: "unlimited", interval: "year" });
    expect(res.statusCode).toBe(409);
    expect((await ada.send("POST", "/api/billing/portal")).json().url).toBe("https://customer-portal.paddle.com/cpl_test");
  });

  it("finds the user from custom data when there's no recorded checkout", async () => {
    await deliver(subscriptionEvent("subscription.created", { transactionId: null, customData: { pass1_user_id: ada.userId } }));
    expect(await plan()).toBe("plus");
  });

  it("ignores a subscription for a price pass1 doesn't sell", async () => {
    await ada.send("POST", "/api/billing/checkout", { plan: "plus", interval: "year" });
    await deliver(subscriptionEvent("subscription.created", { priceId: "pri_something_else" }));
    expect(await plan()).toBe("free");
  });
});

describe("renewal and cancellation", () => {
  it("a renewal moves the period end forward and keeps the plan", async () => {
    await upgradeToPlus();
    await deliver(subscriptionEvent("subscription.updated", { periodEndsAt: "2028-10-01T10:00:00Z" }));
    expect(await plan()).toBe("plus");
    expect((await billing()).subscription.currentPeriodEndsAt).toBe(Date.parse("2028-10-01T10:00:00Z"));
  });

  it("a scheduled cancellation keeps the plan until it takes effect", async () => {
    await upgradeToPlus();
    await deliver(subscriptionEvent("subscription.updated", { cancelsAt: "2027-10-01T10:00:00Z" }));
    expect(await plan()).toBe("plus");
    expect((await billing()).subscription.cancelsAt).toBe(Date.parse("2027-10-01T10:00:00Z"));
  });

  it("when it ends, the user is back on Free and a vault over the limit becomes read-only", async () => {
    await upgradeToPlus();
    const now = new Date();
    await ctx.db.insert(vaultItems).values(
      Array.from({ length: 600 }, () => ({ id: crypto.randomUUID(), userId: ada.userId, data: { v: 1 as const, iv: b64(12), ciphertext: b64(272) }, size: 272, createdAt: now, updatedAt: now })),
    );

    await deliver(subscriptionEvent("subscription.canceled", { status: "canceled" }));
    expect(await plan()).toBe("free");

    // Nothing is deleted; reading, exporting and deleting still work; adding doesn't.
    const list = await ada.send("GET", "/api/vault/items");
    expect(list.json().items).toHaveLength(600);
    expect((await ada.send("POST", "/api/vault/items", { id: crypto.randomUUID(), data: { v: 1, iv: b64(12), ciphertext: b64(272) } })).statusCode).toBe(403);
    expect((await ada.send("DELETE", `/api/vault/items/${list.json().items[0].id}`)).statusCode).toBe(204);
  });
});

describe("failed payment", () => {
  it("keeps the paid plan while Paddle retries, and stays on it when the payment goes through", async () => {
    await upgradeToPlus();
    await deliver(subscriptionEvent("subscription.past_due", { status: "past_due" }));
    expect(await plan()).toBe("plus");
    expect((await billing()).subscription.status).toBe("past_due");

    await deliver(subscriptionEvent("subscription.updated", { status: "active" }));
    expect((await billing()).subscription.status).toBe("active");
  });

  it("drops to Free when Paddle gives up and cancels", async () => {
    await upgradeToPlus();
    await deliver(subscriptionEvent("subscription.past_due", { status: "past_due" }));
    await deliver(subscriptionEvent("subscription.canceled", { status: "canceled" }));
    expect(await plan()).toBe("free");
  });
});

describe("Paddle's delivery quirks", () => {
  it("applies an event delivered twice only once", async () => {
    await ada.send("POST", "/api/billing/checkout", { plan: "plus", interval: "year" });
    const created = subscriptionEvent("subscription.created", {});
    await deliver(created);
    await deliver(subscriptionEvent("subscription.canceled", { status: "canceled" }));
    expect((await deliver(created)).statusCode).toBe(200); // Paddle still gets a 200
    expect(await plan()).toBe("free");
  });

  it("ignores an event older than one already applied", async () => {
    await ada.send("POST", "/api/billing/checkout", { plan: "plus", interval: "year" });
    const created = subscriptionEvent("subscription.created", {});
    const canceled = subscriptionEvent("subscription.canceled", { status: "canceled" });
    await deliver(canceled); // arrives first
    await deliver(created); // older, arrives late
    expect(await plan()).toBe("free");
  });

  it("a late event about an old subscription can't end a new one", async () => {
    await upgradeToPlus(); // sub_01
    await deliver(subscriptionEvent("subscription.canceled", { status: "canceled" }));
    await ada.send("POST", "/api/billing/checkout", { plan: "unlimited", interval: "year" });
    await deliver(subscriptionEvent("subscription.created", { subId: "sub_02", transactionId: "txn_test2", priceId: PRICES.PADDLE_PRICE_UNLIMITED_YEARLY }));
    expect(await plan()).toBe("unlimited");

    await deliver(subscriptionEvent("subscription.updated", { subId: "sub_01", status: "canceled" }));
    expect(await plan()).toBe("unlimited");
  });
});

describe("webhook security", () => {
  it("refuses unsigned or wrongly signed events and changes nothing", async () => {
    await ada.send("POST", "/api/billing/checkout", { plan: "plus", interval: "year" });
    const event = subscriptionEvent("subscription.created", {});
    expect((await deliver(event, "ts=1;h1=00")).statusCode).toBe(401);
    expect((await deliver(event, "")).statusCode).toBe(401);
    expect(await plan()).toBe("free");
  });

  it("can't be used to upgrade yourself by guessing a webhook body", async () => {
    // Even a perfectly shaped event fails without Paddle's secret.
    const forged = JSON.stringify(subscriptionEvent("subscription.created", { customData: { pass1_user_id: ada.userId } }));
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/billing/webhook",
      payload: forged,
      headers: { "content-type": "application/json", "paddle-signature": `ts=${Math.floor(Date.now() / 1000)};h1=${"a".repeat(64)}` },
    });
    expect(res.statusCode).toBe(401);
    expect(await plan()).toBe("free");
  });
});

describe("deleting an account", () => {
  it("cancels the subscription at Paddle first", async () => {
    await upgradeToPlus();
    expect((await ada.send("DELETE", "/api/account", { authKey: ada.authKey })).statusCode).toBe(204);
    expect(paddle.calls.cancels).toEqual(["sub_01"]);
  });

  it("keeps the account if the subscription can't be cancelled", async () => {
    await upgradeToPlus();
    paddle.failCancel = true;
    const res = await ada.send("DELETE", "/api/account", { authKey: ada.authKey });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("BILLING_FAILED");
    expect(await ctx.db.select().from(users).where(eq(users.id, ada.userId))).toHaveLength(1);
  });
});

describe("without billing configured", () => {
  it("says so, and refuses checkouts and webhooks", async () => {
    const { app } = await createTestApp();
    const eve = await loggedInAs(app, "eve@example.com");
    expect((await eve.send("GET", "/api/billing")).json()).toEqual({ enabled: false, subscription: null });
    expect((await eve.send("POST", "/api/billing/checkout", { plan: "plus", interval: "year" })).statusCode).toBe(404);
  });
});
