import { z } from "zod";

// Request and response bodies for /billing/*.

export const PAID_PLAN_IDS = ["plus", "unlimited"] as const;
export const BILLING_INTERVALS = ["year", "month"] as const;

export const checkoutRequestSchema = z.object({
  plan: z.enum(PAID_PLAN_IDS),
  interval: z.enum(BILLING_INTERVALS),
});
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

/** A Paddle page to send the browser to: the checkout, or the subscription management portal. */
export const redirectResponseSchema = z.object({ url: z.url() });
export type RedirectResponse = z.infer<typeof redirectResponseSchema>;

export const billingStatusResponseSchema = z.object({
  /** False until the server has Paddle configured. The app then says upgrades aren't open yet. */
  enabled: z.boolean(),
  subscription: z
    .object({
      plan: z.enum(PAID_PLAN_IDS),
      status: z.enum(["active", "trialing", "past_due", "paused", "canceled"]),
      interval: z.enum(BILLING_INTERVALS),
      /** Milliseconds since 1970. */
      currentPeriodEndsAt: z.int().nullable(),
      cancelsAt: z.int().nullable(),
    })
    .nullable(),
});
export type BillingStatusResponse = z.infer<typeof billingStatusResponseSchema>;
