import { PLANS, type PlanId } from "@pass1/shared";
import { clsx } from "clsx";
import { Activity, ChevronUp, List, Lock, LogOut, Settings, Star, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { Logo } from "../components/Logo";
import { useLockCountdown } from "../session/auto-lock";
import { MOD_KEY } from "../lib/shortcuts";
import { useSession } from "../session/session";
import { SECTION_LABELS, type Section } from "./entries";
import type { VaultEntry } from "./vault-store";

const SECTION_ICONS: Record<Section, ReactNode> = {
  all: <List size={15} />,
  favorites: <Star size={15} />,
  health: <Activity size={15} />,
  trash: <Trash2 size={15} />,
};

export function Sidebar({ entries, counts, section, onSectionChange, email, plan, onOpenSettings, onOpenPlans }: {
  entries: VaultEntry[];
  counts: Record<Section, number>;
  section: Section;
  onSectionChange: (section: Section) => void;
  email: string;
  plan: PlanId;
  onOpenSettings: () => void;
  onOpenPlans: () => void;
}) {
  return (
    <nav aria-label="Vault" className="hidden w-58 shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar px-2.5 py-3.5 md:flex">
      <div className="px-2.5 pt-0.5 pb-4">
        <Logo />
      </div>

      {(Object.keys(SECTION_LABELS) as Section[]).map((s) => (
        <button
          key={s}
          type="button"
          aria-current={section === s}
          onClick={() => onSectionChange(s)}
          className={clsx(
            "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left text-[13px]",
            section === s ? "bg-surface font-medium text-text ring-1 ring-border" : "text-muted hover:bg-border/40 hover:text-text",
          )}
        >
          <span aria-hidden="true">{SECTION_ICONS[s]}</span>
          <span className="flex-1">{SECTION_LABELS[s]}</span>
          {s === "health" ? (
            counts.health > 0 && <span className="rounded-full bg-warning-soft px-[7px] text-[11px] font-semibold text-warning">{counts.health}</span>
          ) : (
            counts[s] > 0 && <span className="text-xs text-muted tabular-nums">{counts[s]}</span>
          )}
        </button>
      ))}

      {/* A flex column, not a grid: a long email must truncate, not widen the sidebar. */}
      <div className="mt-auto flex flex-col gap-2.5">
        <PlanCard entries={entries} plan={plan} onOpenPlans={onOpenPlans} />
        <AccountMenu email={email} onOpenSettings={onOpenSettings} side="top" />
      </div>
    </nav>
  );
}

/** Usage against the plan's limit, and the way to upgrade. Trashed items count: they're still stored. */
function PlanCard({ entries, plan, onOpenPlans }: { entries: VaultEntry[]; plan: PlanId; onOpenPlans: () => void }) {
  const { name, limits } = PLANS[plan];
  const items = entries.length;
  const bytes = entries.reduce((sum, e) => sum + e.size, 0);
  // Show whichever limit is closer to being reached.
  const itemShare = limits.maxItems === null ? 0 : items / limits.maxItems;
  const byteShare = bytes / limits.maxStorageBytes;
  const share = Math.min(Math.max(itemShare, byteShare), 1);
  const usage =
    byteShare > itemShare
      ? `${formatMB(bytes)} of ${formatMB(limits.maxStorageBytes)}`
      : limits.maxItems === null
        ? `${items} items`
        : `${items} of ${limits.maxItems} items`;

  return (
    <div className="grid gap-2 rounded-lg border border-accent-line bg-accent-soft p-3">
      <div className="flex justify-between gap-2 text-xs">
        <span className="font-semibold text-accent">{plan === "free" ? "Free plan" : name}</span>
        <span className="text-muted tabular-nums">{usage}</span>
      </div>
      <div className="h-1 rounded-full bg-accent-line" aria-hidden="true">
        <div
          className={clsx("h-1 min-w-1.5 rounded-full", share >= 0.9 ? "bg-danger" : share >= 0.75 ? "bg-warning" : "bg-accent")}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      {plan !== "unlimited" && (
        <button type="button" onClick={onOpenPlans} className="cursor-pointer justify-self-start text-xs font-semibold text-accent hover:underline">
          {plan === "free" ? "Get pass1 Plus →" : "See plans →"}
        </button>
      )}
    </div>
  );
}

/** The account button: email and lock timer, opening Settings, Lock and Log out. */
export function AccountMenu({ email, onOpenSettings, side }: { email: string; onOpenSettings: () => void; side: "top" | "bottom" }) {
  const { lock, logOut } = useSession();
  const locksIn = useLockCountdown();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 text-left hover:bg-border/40">
          <span aria-hidden="true" className="grid size-7.5 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-on-accent">
            {email.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{email}</span>
            <span className="block text-xs text-muted">
              Locks in <span className="font-mono tabular-nums">{locksIn}</span>
            </span>
          </span>
          <ChevronUp size={14} className="shrink-0 text-muted" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align="start"
          sideOffset={6}
          className="animate-pop-in z-30 grid w-53 gap-0.5 rounded-lg border border-border bg-surface p-1.5 shadow-pop"
        >
          <MenuItem icon={<Settings size={15} />} label="Settings" shortcut={`${MOD_KEY},`} onSelect={onOpenSettings} />
          <MenuItem icon={<Lock size={15} />} label="Lock now" shortcut={`${MOD_KEY}L`} onSelect={lock} />
          <DropdownMenu.Separator className="mx-1.5 my-1 h-px bg-border" />
          <MenuItem icon={<LogOut size={15} />} label="Log out" onSelect={() => void logOut()} muted />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({ icon, label, shortcut, onSelect, muted }: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  muted?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={clsx(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-sunken",
        muted && "text-muted",
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="font-mono text-[11px] text-muted">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

function formatMB(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
