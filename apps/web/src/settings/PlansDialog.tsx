import { PLAN_IDS, PLANS, type PlanId } from "@pass1/shared";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { openBillingPortal, startCheckout, useBilling } from "../lib/billing";
import { errorMessage } from "../session/session";
import { Outcome } from "./layout";

// The plans side by side. Choosing one sends the browser to Paddle's checkout; people already
// subscribed change plans in Paddle's portal. Without billing configured on the server, the
// dialog only shows the plans and says upgrades are coming.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export function PlansDialog({ open, onOpenChange, currentPlan, userId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: PlanId;
  userId: string;
}) {
  const billing = useBilling(userId);
  const [interval, setInterval] = useState<"year" | "month">("year");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subscribed = !!billing?.subscription && PAID_STATUSES.has(billing.subscription.status);

  async function go(action: () => Promise<void>, plan: PlanId) {
    setBusy(plan);
    setError(null);
    try {
      await action(); // navigates away on success
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="pass1 plans" description="Every plan has the same encryption. Paid plans add room and features." size="lg">
      <div className="flex justify-center px-5 pt-3">
        <SegmentedControl
          label="Billing period"
          value={interval}
          options={[
            { value: "year", label: "Yearly" },
            { value: "month", label: "Monthly" },
          ]}
          onChange={setInterval}
        />
      </div>

      <div className="grid flex-1 gap-3 overflow-y-auto px-5 pt-4 md:grid-cols-3">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const isCurrent = id === currentPlan;
          return (
            // The recommended plan stands out in the accent color only: border, a faint tint and its
            // badge. One border, not border + ring, so nothing is drawn outside the card.
            <div
              key={id}
              className={clsx("flex flex-col gap-4 rounded-lg border p-4", id === "plus" ? "border-accent bg-accent-soft/40" : "border-border")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{plan.name}</span>
                {isCurrent ? <Badge tone="accent">Your plan</Badge> : id === "plus" && <Badge tone="accent-solid">Recommended</Badge>}
              </div>

              <div className="grid gap-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-[28px] font-bold tracking-tight tabular-nums">
                    {plan.price ? usd.format(interval === "year" ? plan.price.yearly : plan.price.monthly) : "$0"}
                  </span>
                  <span className="text-[13px] text-muted">{plan.price ? (interval === "year" ? "/ year" : "/ month") : "forever"}</span>
                </div>
                <span className="text-xs text-muted">
                  {!plan.price
                    ? "No card needed"
                    : interval === "year"
                      ? `${usd.format(plan.price.yearly / 12)} a month, billed yearly`
                      : `or ${usd.format(plan.price.yearly)} billed yearly`}
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

              {billing?.enabled && id !== "free" && (
                <div className="mt-auto pt-1">
                  {subscribed ? (
                    <Button variant="secondary" className="w-full" disabled={busy !== null} onClick={() => go(openBillingPortal, id)}>
                      {busy === id ? "Opening…" : isCurrent ? "Manage subscription" : "Switch plan"}
                    </Button>
                  ) : (
                    <Button
                      variant={id === "plus" ? "primary" : "secondary"}
                      className="w-full"
                      disabled={busy !== null}
                      onClick={() => go(() => startCheckout({ plan: id, interval }), id)}
                    >
                      {busy === id ? "Opening checkout…" : `Choose ${plan.name.replace("pass1 ", "")}`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 px-5 pt-3 pb-5 text-[13px] text-muted">
        {error && <Outcome tone="danger">{error}</Outcome>}
        {billing === null ? null : billing.enabled ? (
          <p>Payments are handled by Paddle. pass1 never sees your card details. Cancel any time; your vault stays yours.</p>
        ) : (
          <p>Upgrades open soon. Your vault stays as it is until then.</p>
        )}
      </div>
    </Dialog>
  );
}
