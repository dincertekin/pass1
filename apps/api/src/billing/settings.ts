import type { BILLING_INTERVALS, PAID_PLAN_IDS } from "@pass1/shared";
import type { Config } from "../config.js";

export type PaidPlan = (typeof PAID_PLAN_IDS)[number];
export type Interval = (typeof BILLING_INTERVALS)[number];

export interface BillingSettings {
  environment: "sandbox" | "production";
  apiKey: string;
  webhookSecret: string;
  /** Paddle price ID for each plan and billing period. */
  prices: Record<PaidPlan, Record<Interval, string>>;
}

/** Billing settings from the config, or null when billing is off (config.ts makes it all or nothing). */
export function billingSettings(config: Config): BillingSettings | null {
  if (!config.PADDLE_API_KEY || !config.PADDLE_WEBHOOK_SECRET) return null;
  return {
    environment: config.PADDLE_ENVIRONMENT,
    apiKey: config.PADDLE_API_KEY,
    webhookSecret: config.PADDLE_WEBHOOK_SECRET,
    prices: {
      plus: { year: config.PADDLE_PRICE_PLUS_YEARLY!, month: config.PADDLE_PRICE_PLUS_MONTHLY! },
      unlimited: { year: config.PADDLE_PRICE_UNLIMITED_YEARLY!, month: config.PADDLE_PRICE_UNLIMITED_MONTHLY! },
    },
  };
}

/** Which plan and period a Paddle price ID stands for, or null for a price pass1 doesn't sell. */
export function planForPrice(settings: BillingSettings, priceId: string): { plan: PaidPlan; interval: Interval } | null {
  for (const plan of ["plus", "unlimited"] as const) {
    for (const interval of ["year", "month"] as const) {
      if (settings.prices[plan][interval] === priceId) return { plan, interval };
    }
  }
  return null;
}
