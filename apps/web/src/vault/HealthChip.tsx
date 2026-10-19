import { clsx } from "clsx";
import type { ItemHealth } from "./health";

/** "Reused", "Weak", "Good" or "Strong". Reuse wins: it's the bigger risk even for a strong password. */
export function healthLabel(health: ItemHealth | undefined): { text: string; tone: "danger" | "warning" | "success" } | null {
  if (!health) return null;
  if (health.reusedWith.length > 0) return { text: "Reused", tone: "warning" };
  if (health.strength === "weak") return { text: "Weak", tone: "danger" };
  if (health.strength === "good") return { text: "Good", tone: "success" };
  if (health.strength === "strong") return { text: "Strong", tone: "success" };
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
