// Plan limits live here so the API (which enforces them) and the web app (which shows the
// usage meter) can't disagree. Prices are not here: they're configured in Paddle.

export const PLAN_IDS = ["free", "plus", "unlimited"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanLimits {
  /** `null` means no limit. */
  maxItems: number | null;
  /** Total encrypted bytes across all items. Always set, even on Unlimited, to stop abuse. */
  maxStorageBytes: number;
}

const MB = 1024 * 1024;

export const PLANS: Record<PlanId, { name: string; limits: PlanLimits }> = {
  free: { name: "Free", limits: { maxItems: 500, maxStorageBytes: 10 * MB } },
  plus: { name: "pass1 Plus", limits: { maxItems: 5_000, maxStorageBytes: 100 * MB } },
  unlimited: { name: "pass1 Unlimited", limits: { maxItems: null, maxStorageBytes: 1024 * MB } },
};
