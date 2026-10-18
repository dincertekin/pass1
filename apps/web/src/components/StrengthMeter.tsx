import { clsx } from "clsx";
import type { PasswordStrength } from "../lib/password-strength";

const levels = [
  { label: "Very weak", bar: "bg-danger", text: "text-danger" },
  { label: "Weak", bar: "bg-danger", text: "text-danger" },
  { label: "Fair", bar: "bg-warning", text: "text-warning" },
  { label: "Good", bar: "bg-success", text: "text-success" },
  { label: "Strong", bar: "bg-success", text: "text-success" },
];

/** Four bars plus a word, so strength never depends on color alone. */
export function StrengthMeter({ strength }: { strength: PasswordStrength | null }) {
  const level = strength ? levels[strength.score]! : null;
  const filled = strength ? Math.max(strength.score, 1) : 0;

  return (
    <div className="grid gap-1.5" aria-live="polite">
      <div className="grid grid-cols-4 gap-[3px]" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={clsx("h-1 rounded-full", level && n <= filled ? level.bar : "bg-sunken")} />
        ))}
      </div>
      <div className="flex justify-between gap-2 text-xs">
        <span className={clsx("font-medium", level?.text ?? "text-muted")}>{level ? level.label : "Strength"}</span>
        {strength?.warning && <span className="text-right text-muted">{strength.warning}</span>}
      </div>
    </div>
  );
}
