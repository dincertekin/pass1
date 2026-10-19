import { PLAN_IDS, PLANS, type PlanId } from "@pass1/shared";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Dialog } from "../components/ui/Dialog";

// The plans, side by side. Payments aren't built yet (roadmap Phase 7), so this explains the
// plans and their prices and says upgrades are coming; it never pretends to take money.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function PlansDialog({ open, onOpenChange, currentPlan }: { open: boolean; onOpenChange: (open: boolean) => void; currentPlan: PlanId }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="pass1 plans" description="Every plan has the same encryption. Paid plans add room and features." size="lg">
      <div className="grid flex-1 gap-3 overflow-y-auto px-5 pt-4 md:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          return (
            // The recommended plan stands out in the accent color only: border, a faint tint and its
            // badge. One border, not border + ring, so nothing is drawn outside the card.
            <div
              key={id}
              className={clsx("flex flex-col gap-4 rounded-lg border p-4", id === "plus" ? "border-accent bg-accent-soft/40" : "border-border")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{plan.name}</span>
                {id === currentPlan ? <Badge tone="accent">Your plan</Badge> : id === "plus" && <Badge tone="accent-solid">Recommended</Badge>}
              </div>

              <div className="grid gap-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-[28px] font-bold tracking-tight tabular-nums">{plan.price ? usd.format(plan.price.yearly) : "$0"}</span>
                  <span className="text-[13px] text-muted">{plan.price ? "/ year" : "forever"}</span>
                </div>
                <span className="text-xs text-muted">
                  {plan.price ? `or ${usd.format(plan.price.monthly)} billed monthly` : "No card needed"}
                </span>
              </div>

              <ul className="grid gap-2 border-t border-border pt-4 text-[13px]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="px-5 pt-3 pb-5 text-[13px] text-muted">Upgrades open soon. Your vault stays as it is until then.</p>
    </Dialog>
  );
}
