import { PLANS, type PlanId } from "@pass1/shared";
import { clsx } from "clsx";
import type { VaultEntry } from "./vault-store";

/** "12 of 500 items" plus a bar. Trashed items count, because they're still stored. */
export function UsageMeter({ entries, plan }: { entries: VaultEntry[]; plan: PlanId }) {
  const { limits } = PLANS[plan];
  const items = entries.length;
  const bytes = entries.reduce((sum, e) => sum + e.size, 0);

  // Show whichever limit is closer to being reached.
  const itemShare = limits.maxItems === null ? 0 : items / limits.maxItems;
  const byteShare = bytes / limits.maxStorageBytes;
  const share = Math.min(Math.max(itemShare, byteShare), 1);

  const label =
    byteShare > itemShare
      ? `${formatMB(bytes)} of ${formatMB(limits.maxStorageBytes)}`
      : limits.maxItems === null
        ? `${items} items`
        : `${items} of ${limits.maxItems} items`;

  return (
    <div className="grid gap-1.5 text-xs">
      <div className="flex justify-between gap-2">
        <span className="text-muted">{PLANS[plan].name}</span>
        <span className="tabular-nums">{label}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
        <div
          className={clsx("h-full rounded-full", share >= 0.9 ? "bg-danger" : share >= 0.75 ? "bg-warning" : "bg-accent")}
          style={{ width: `${Math.max(share * 100, items > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function formatMB(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
