import type { PlanId } from "@pass1/shared";
import type { MessageKey } from "./i18n/translate";

// What each plan includes, as shown on the plans page. Prices and limits are in @pass1/shared
// (plans.ts), where the server enforces them; this is only the list people read.
export const PLAN_FEATURES: Record<PlanId, MessageKey[]> = {
  free: ["planFeature.items500", "planFeature.everyDevice", "planFeature.passwordHealth", "planFeature.encryptedExport"],
  plus: ["planFeature.items5000", "planFeature.totp", "planFeature.breachAlerts", "planFeature.attachments"],
  unlimited: ["planFeature.unlimitedItems", "planFeature.everythingInPlus", "planFeature.emergencyAccess", "planFeature.prioritySupport"],
};
