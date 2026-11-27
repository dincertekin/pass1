import { clsx } from "clsx";
import { t } from "../lib/i18n";
import type { PasswordStrength } from "../lib/password-strength";

const levels = [
  { label: t("strength.veryWeak"), bar: "bg-danger", text: "text-danger" },
  { label: t("strength.weak"), bar: "bg-danger", text: "text-danger" },
  { label: t("strength.fair"), bar: "bg-warning", text: "text-warning" },
  { label: t("strength.good"), bar: "bg-success", text: "text-success" },
  { label: t("strength.strong"), bar: "bg-success", text: "text-success" },
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
        <span className={clsx("font-medium", level?.text ?? "text-muted")}>{level ? level.label : t("strength.label")}</span>
        {strength?.warning && <span className="text-right text-muted">{strength.warning}</span>}
      </div>
    </div>
  );
}
