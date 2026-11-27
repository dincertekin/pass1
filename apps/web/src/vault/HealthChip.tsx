import { clsx } from "clsx";
import type { ItemHealth } from "@pass1/core";
import { t } from "../lib/i18n";

/** "Reused", "Weak", "Good" or "Strong". Reuse wins: it's the bigger risk even for a strong password. */
export function healthLabel(health: ItemHealth | undefined): { text: string; tone: "danger" | "warning" | "success" } | null {
  if (!health) return null;
  if (health.reusedWith.length > 0) return { text: t("health.reused"), tone: "warning" };
  if (health.strength === "weak") return { text: t("strength.weak"), tone: "danger" };
  if (health.strength === "good") return { text: t("strength.good"), tone: "success" };
  if (health.strength === "strong") return { text: t("strength.strong"), tone: "success" };
  return null;
}

const tones = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
};

export function HealthChip({ health, problemsOnly = false }: { health: ItemHealth | undefined; problemsOnly?: boolean }) {
  const label = healthLabel(health);
  if (!label || (problemsOnly && label.tone === "success")) return null;
  return <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", tones[label.tone])}>{label.text}</span>;
}
