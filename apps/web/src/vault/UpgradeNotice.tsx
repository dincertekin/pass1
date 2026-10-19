import { PLANS, type PlanId } from "@pass1/shared";
import { CheckCircle2, Clock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { loadBilling, UPGRADE_PENDING_KEY } from "../lib/billing";
import { useSession } from "../session/session";

// Shown after coming back from Paddle's checkout. The page reloads on the way back (so the vault
// locks and is unlocked again), and Paddle's webhook can arrive a few seconds after the payment,
// so the plan may still say Free for a moment. This says so instead of looking like nothing happened.

function readPending(): string | null {
  try {
    return sessionStorage.getItem(UPGRADE_PENDING_KEY);
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    sessionStorage.removeItem(UPGRADE_PENDING_KEY);
  } catch {
    // Nothing to clear.
  }
}

export function UpgradeNotice({ userId, plan }: { userId: string; plan: PlanId }) {
  const { refreshAccount } = useSession();
  const [pending, setPending] = useState(readPending);
  const [checking, setChecking] = useState(false);
  const upgraded = pending !== null && plan !== "free";

  useEffect(() => {
    if (upgraded) clearPending();
  }, [upgraded]);

  if (!pending) return null;

  async function checkAgain() {
    setChecking(true);
    await Promise.all([refreshAccount(), loadBilling(userId)]).catch(() => {});
    setChecking(false);
  }

  function dismiss() {
    clearPending();
    setPending(null);
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-3 text-[13px]">
      {upgraded ? (
        <>
          <CheckCircle2 size={18} className="shrink-0 text-success" aria-hidden="true" />
          <span className="flex-1">Welcome to {PLANS[plan].name}. Thanks for supporting pass1.</span>
        </>
      ) : (
        <>
          <Clock size={18} className="shrink-0 text-muted" aria-hidden="true" />
          <span className="flex-1">Thanks! We're confirming your payment with Paddle. This usually takes less than a minute.</span>
          <Button variant="secondary" size="sm" onClick={() => void checkAgain()} disabled={checking}>
            {checking ? "Checking…" : "Check again"}
          </Button>
        </>
      )}
      <IconButton label="Dismiss" onClick={dismiss}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
