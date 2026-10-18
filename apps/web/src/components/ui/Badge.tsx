import { clsx } from "clsx";
import type { ReactNode } from "react";

const tones = {
  neutral: "bg-sunken text-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-px text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}
