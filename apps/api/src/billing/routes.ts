import { checkoutRequestSchema, type BillingStatusResponse, type RedirectResponse } from "@pass1/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { requireUser } from "../auth/sessions.js";
import { billingCheckouts, subscriptions } from "../db/schema.js";
import { ApiError, parseBody } from "../errors.js";
import type { PaddleClient } from "./paddle.js";
import { billingSettings } from "./settings.js";
import { verifyPaddleSignature } from "./signature.js";
import { applyWebhookEvent } from "./webhooks.js";

// Plans and billing. Payments happen on Paddle, never on pass1's own pages: the browser is sent
// to a checkout or portal URL, and Paddle tells the server what happened through the webhook.

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);
const CHECKOUT_LIMIT = { max: 10, timeWindow: 60 * 1000 };

/** The webhook's path. app.ts exempts it from the Origin check: its signature is its proof. */
export const WEBHOOK_PATH = "/api/billing/webhook";

export function billingRoutes(app: FastifyInstance, { db, config, paddle }: AppDeps) {
  const settings = billingSettings(config);

  function requireBilling(): PaddleClient {
    if (!settings || !paddle) throw new ApiError(404, "NOT_FOUND", "Upgrades aren't open yet.");
    return paddle;
  }

  app.get("/billing", async (request): Promise<BillingStatusResponse> => {
    const user = await requireUser(db, config, request);
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    return {
      enabled: settings !== null,
      subscription:
        sub && sub.plan !== "free"
          ? {
              plan: sub.plan,
              status: sub.status,
              interval: sub.interval,
              currentPeriodEndsAt: sub.currentPeriodEndsAt?.getTime() ?? null,
              cancelsAt: sub.cancelsAt?.getTime() ?? null,
            }
          : null,
    };
  });

  /** Starts a Paddle checkout and returns its URL. Someone already subscribed changes plan in the portal. */
  app.post("/billing/checkout", { config: { rateLimit: CHECKOUT_LIMIT } }, async (request): Promise<RedirectResponse> => {
    const client = requireBilling();
    const user = await requireUser(db, config, request);
    const { plan, interval } = parseBody(checkoutRequestSchema, request.body);

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    if (sub && PAID_STATUSES.has(sub.status)) {
      throw new ApiError(409, "CONFLICT", "You already have a subscription. Change it under Manage subscription.");
    }

    const { transactionId, url } = await client.createCheckout({
      priceId: settings!.prices[plan][interval],
      userId: user.id,
      customerId: sub?.paddleCustomerId ?? null,
    });
    // How the webhook finds this user when Paddle reports the new subscription.
    await db.insert(billingCheckouts).values({ paddleTransactionId: transactionId, userId: user.id });
    return { url };
  });

  /** Paddle's portal for this subscription: change plan or period, update the card, or cancel. */
  app.post("/billing/portal", async (request): Promise<RedirectResponse> => {
    const client = requireBilling();
    const user = await requireUser(db, config, request);
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    if (!sub) throw new ApiError(404, "NOT_FOUND", "You don't have a subscription.");
    return { url: await client.createPortalUrl(sub.paddleCustomerId, sub.paddleSubscriptionId) };
  });

  // The webhook needs the body exactly as sent to check its signature, so in this scope JSON
  // is kept as the raw string instead of being parsed.
  app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => done(null, body));

    scope.post("/billing/webhook", async (request, reply) => {
      if (!settings) throw new ApiError(404, "NOT_FOUND", "Not found.");
      const rawBody = typeof request.body === "string" ? request.body : "";
      const signature = request.headers["paddle-signature"];
      if (!verifyPaddleSignature(typeof signature === "string" ? signature : undefined, rawBody, settings.webhookSecret)) {
        request.log.warn("billing webhook: bad signature");
        throw new ApiError(401, "UNAUTHENTICATED", "Bad signature.");
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new ApiError(400, "VALIDATION_FAILED", "Body isn't JSON.");
      }

      const outcome = await applyWebhookEvent(db, settings, body);
      request.log.info({ outcome }, "billing webhook");
      return reply.status(200).send({ ok: true });
    });
  });
}
