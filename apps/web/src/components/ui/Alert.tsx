import { clsx } from "clsx";
import type { ReactNode } from "react";

const tones = {
  danger: "border-danger bg-danger-soft",
  warning: "border-warning bg-warning-soft",
};

/** A message box. `role="alert"` makes screen readers announce it as soon as it appears. */
export function Alert({ tone = "danger", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <div role="alert" className={clsx("rounded-md border px-3 py-2.5 text-[13px] text-text", tones[tone])}>
      {children}
    </div>
  );
}
