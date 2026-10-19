import type { BillingSettings } from "./settings.js";

// The few Paddle API calls pass1 makes. Behind an interface, so tests use a fake instead of
// calling Paddle. Docs: https://developer.paddle.com/api-reference/overview

export interface PaddleClient {
  /** Starts a checkout for one price. Returns the transaction ID and the URL to send the browser to. */
  createCheckout(input: { priceId: string; userId: string; customerId: string | null }): Promise<{ transactionId: string; url: string }>;
  /** A link to Paddle's customer portal, where people change plan, payment method, or cancel. */
  createPortalUrl(customerId: string, subscriptionId: string): Promise<string>;
  /** Cancels straight away, without waiting for the period to end (used when deleting an account). */
  cancelSubscriptionNow(subscriptionId: string): Promise<void>;
}

export class PaddleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaddleError";
  }
}

export function createPaddleClient(settings: BillingSettings): PaddleClient {
  const base = settings.environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(base + path, {
      method,
      headers: { authorization: `Bearer ${settings.apiKey}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Paddle's error bodies describe the request, not secrets, so they're safe to log.
      throw new PaddleError(`Paddle ${method} ${path} failed with ${res.status}: ${await res.text().catch(() => "")}`);
    }
    return (await res.json()) as T;
  }

  return {
    async createCheckout({ priceId, userId, customerId }) {
      const { data } = await call<{ data: { id: string; checkout: { url: string | null } | null } }>("POST", "/transactions", {
        items: [{ price_id: priceId, quantity: 1 }],
        // Returning subscribers reuse their Paddle customer, so their details are prefilled.
        ...(customerId && { customer_id: customerId }),
        custom_data: { pass1_user_id: userId },
        // null: use the default payment link set in Paddle, our checkout page (see apps/checkout).
        checkout: { url: null },
      });
      if (!data.checkout?.url) throw new PaddleError("Paddle returned no checkout URL. Set a default payment link in Paddle.");
      return { transactionId: data.id, url: data.checkout.url };
    },

    async createPortalUrl(customerId, subscriptionId) {
      const { data } = await call<{ data: { urls: { general: { overview: string } } } }>(
        "POST",
        `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
        { subscription_ids: [subscriptionId] },
      );
      return data.urls.general.overview;
    },

    async cancelSubscriptionNow(subscriptionId) {
      await call("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { effective_from: "immediately" });
    },
  };
}
