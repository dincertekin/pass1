import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { billingCheckouts, subscriptions, users, webhookEvents, SUBSCRIPTION_STATUSES } from "../db/schema.js";
import { planForPrice, type BillingSettings } from "./settings.js";

// Applies Paddle webhook events to pass1: which subscription each user has, and their plan.
//
// Every subscription.* event carries the whole subscription, so each one is handled the same
// way: work out the plan it means, and store it. What each Paddle status means for the plan:
//
//   active, trialing   the paid plan
//   past_due           still the paid plan: a payment failed and Paddle is retrying it
//   paused, canceled   Free. Over the Free limits, the vault becomes read-only: nothing is deleted.
//
// Safe against Paddle's delivery quirks: an event delivered twice is applied once, and an event
// that arrives after a newer one for the same subscription is ignored.

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

const envelopeSchema = z.object({ event_id: z.string().min(1), event_type: z.string() });

const subscriptionEventSchema = z.object({
  occurred_at: z.iso.datetime(),
  data: z.object({
    id: z.string().regex(/^sub_/),
    status: z.enum(SUBSCRIPTION_STATUSES),
    customer_id: z.string().regex(/^ctm_/),
    transaction_id: z.string().nullish(),
    custom_data: z.record(z.string(), z.unknown()).nullish(),
    items: z.array(z.object({ price: z.object({ id: z.string() }) })).min(1),
    current_billing_period: z.object({ ends_at: z.iso.datetime() }).nullish(),
    scheduled_change: z.object({ action: z.string(), effective_at: z.iso.datetime() }).nullish(),
  }),
});

export type WebhookOutcome = { result: "applied"; userId: string; plan: string } | { result: "ignored"; reason: string };

/**
 * Applies one verified webhook event. Throws if a subscription event doesn't have the expected
 * shape: Paddle then retries it, and the error shows up in the logs instead of being lost.
 */
export async function applyWebhookEvent(db: Db, settings: BillingSettings, body: unknown): Promise<WebhookOutcome> {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) return { result: "ignored", reason: "not a Paddle event" };
  if (!envelope.data.event_type.startsWith("subscription.")) return { result: "ignored", reason: `${envelope.data.event_type} isn't used` };
  const event = subscriptionEventSchema.parse(body);
  const sub = event.data;

  return db.transaction(async (tx): Promise<WebhookOutcome> => {
    // Recording the event ID first makes a second delivery of the same event do nothing.
    const fresh = await tx.insert(webhookEvents).values({ eventId: envelope.data.event_id }).onConflictDoNothing().returning();
    if (fresh.length === 0) return { result: "ignored", reason: "already applied" };

    const price = planForPrice(settings, sub.items[0]!.price.id);
    if (!price) return { result: "ignored", reason: `price ${sub.items[0]!.price.id} isn't a pass1 plan` };

    const userId = await findUser(tx, sub);
    if (!userId) return { result: "ignored", reason: `no pass1 user for subscription ${sub.id}` };

    const occurredAt = new Date(event.occurred_at);
    const [current] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    if (current?.paddleSubscriptionId === sub.id && occurredAt <= current.lastEventAt) {
      return { result: "ignored", reason: "older than the last event applied" };
    }
    // Someone who cancelled and subscribed again: a late event about the old subscription must
    // never end the new one.
    if (current && current.paddleSubscriptionId !== sub.id && PAID_STATUSES.has(current.status) && !PAID_STATUSES.has(sub.status)) {
      return { result: "ignored", reason: "about an older subscription" };
    }

    const plan = PAID_STATUSES.has(sub.status) ? price.plan : "free";
    const values = {
      userId,
      paddleSubscriptionId: sub.id,
      paddleCustomerId: sub.customer_id,
      plan: price.plan,
      status: sub.status,
      interval: price.interval,
      currentPeriodEndsAt: sub.current_billing_period ? new Date(sub.current_billing_period.ends_at) : null,
      cancelsAt: sub.scheduled_change?.action === "cancel" ? new Date(sub.scheduled_change.effective_at) : null,
      lastEventAt: occurredAt,
      updatedAt: new Date(),
    };
    await tx.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.userId, set: values });
    await tx.update(users).set({ plan }).where(eq(users.id, userId));
    return { result: "applied", userId, plan };
  });
}

/**
 * The pass1 user a subscription belongs to: from an earlier event for it, else from the checkout
 * that created it (recorded by POST /billing/checkout), else from the custom data on it.
 */
async function findUser(db: Pick<Db, "select">, sub: z.infer<typeof subscriptionEventSchema>["data"]): Promise<string | null> {
  const [known] = await db.select({ userId: subscriptions.userId }).from(subscriptions).where(eq(subscriptions.paddleSubscriptionId, sub.id));
  if (known) return known.userId;

  if (sub.transaction_id) {
    const [checkout] = await db.select({ userId: billingCheckouts.userId }).from(billingCheckouts).where(eq(billingCheckouts.paddleTransactionId, sub.transaction_id));
    if (checkout) return checkout.userId;
  }

  const claimed = sub.custom_data?.pass1_user_id;
  if (typeof claimed === "string") {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, claimed));
    if (user) return user.id;
  }
  return null;
}
