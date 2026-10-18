import type { PlanId } from "@pass1/shared";
import { clsx } from "clsx";
import { Lock, LogOut } from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/ui/Button";
import { useSession } from "../session/session";
import { inSection, SECTION_LABELS, type Section } from "./entries";
import { UsageMeter } from "./UsageMeter";
import type { VaultEntry } from "./vault-store";

const SECTIONS: Section[] = ["all", "favorites", "trash"];

export function Sidebar({ entries, section, onSectionChange, email, plan }: {
  entries: VaultEntry[];
  section: Section;
  onSectionChange: (section: Section) => void;
  email: string;
  plan: PlanId;
}) {
  const { lock, logOut } = useSession();

  return (
    <nav aria-label="Vault sections" className="hidden flex-col gap-0.5 border-r border-border bg-sunken p-2 md:flex">
      <div className="px-2 pt-1 pb-3">
        <Logo />
      </div>

      {SECTIONS.map((s) => (
        <button
          key={s}
          type="button"
          aria-current={section === s}
          onClick={() => onSectionChange(s)}
          className={clsx(
            "flex cursor-pointer justify-between rounded-sm px-2 py-1.5 text-left text-[13px]",
            section === s ? "bg-surface font-medium text-text ring-1 ring-border" : "text-muted hover:text-text",
          )}
        >
          <span>{SECTION_LABELS[s]}</span>
          <span className="tabular-nums">{entries.filter((e) => inSection(e, s)).length}</span>
        </button>
      ))}

      <div className="mt-auto grid gap-3 border-t border-border px-2 pt-3">
        <UsageMeter entries={entries} plan={plan} />
        <p className="truncate text-xs text-muted" title={email}>
          {email}
        </p>
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={lock} className="flex-1">
            <Lock size={14} /> Lock
          </Button>
          <Button variant="ghost" size="sm" onClick={logOut}>
            <LogOut size={14} /> Log out
          </Button>
        </div>
      </div>
    </nav>
  );
}

/** On phones the sidebar is hidden, so its sections and actions move to this bar. */
export function MobileBar({ section, onSectionChange }: { section: Section; onSectionChange: (section: Section) => void }) {
  const { lock } = useSession();
  return (
    <div className="grid gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
      <div className="flex items-center justify-between">
        <Logo />
        <Button variant="secondary" size="sm" onClick={lock}>
          <Lock size={14} /> Lock
        </Button>
      </div>
      <div className="flex gap-1" role="group" aria-label="Vault sections">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={section === s}
            onClick={() => onSectionChange(s)}
            className={clsx(
              "cursor-pointer rounded-sm px-2 py-1 text-xs",
              section === s ? "bg-sunken font-medium text-text" : "text-muted",
            )}
          >
            {SECTION_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
