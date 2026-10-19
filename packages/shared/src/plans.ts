// Plan limits live here so the API (which enforces them) and the web app (which shows the
// usage meter) can't disagree. Prices are here for display only: once billing exists, Paddle
// is what actually charges, and these must be kept equal to its prices.

export const PLAN_IDS = ["free", "plus", "unlimited"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  /** `null` means no limit. */
  maxItems: number | null;
  /** Total encrypted bytes across all items. Always set, even on Unlimited, to stop abuse. */
  maxStorageBytes: number;
}

const MB = 1024 * 1024;

export interface Plan {
  name: string;
  limits: PlanLimits;
  /** In US dollars. null for Free. */
  price: { yearly: number; monthly: number } | null;
  /** What the plan adds, shown in the app's plan picker. */
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    name: "Free",
    limits: { maxItems: 500, maxStorageBytes: 10 * MB },
    price: null,
    features: ["500 items", "Every device", "Password health", "Encrypted export"],
  },
  plus: {
    name: "pass1 Plus",
    limits: { maxItems: 5_000, maxStorageBytes: 100 * MB },
    price: { yearly: 19, monthly: 2.49 },
    features: ["5,000 items", "Two-factor codes (TOTP)", "Breach alerts", "File attachments"],
  },
  unlimited: {
    name: "pass1 Unlimited",
    limits: { maxItems: null, maxStorageBytes: 1024 * MB },
    price: { yearly: 39, monthly: 4.49 },
    features: ["Unlimited items", "Everything in Plus", "Emergency access", "Priority support"],
  },
};
