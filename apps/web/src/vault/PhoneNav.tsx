import { clsx } from "clsx";
import { Activity, Dices, Lock, Plus, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useSession } from "../session/session";
import { SECTION_MESSAGES, type Section } from "@pass1/core";
import { t } from "../lib/i18n";

// Phone-only parts of the vault: the header with filter chips, the floating New button and the
// tab bar at the bottom, where thumbs reach. Hidden from md up, where the sidebar takes over.

export function PhoneHeader({ section, counts, onSectionChange, search }: {
  section: Section;
  counts: Record<Section, number>;
  onSectionChange: (section: Section) => void;
  search: ReactNode;
}) {
  const { lock } = useSession();
  const chips: { id: Section; label: string; warn?: boolean }[] = [
    { id: "all", label: t("nav.all") },
    { id: "favorites", label: t("section.favorites") },
    ...(counts.health > 0 ? [{ id: "health" as const, label: t("nav.toFix", { count: counts.health }), warn: true }] : []),
    { id: "trash", label: t("section.trash") },
  ];

  return (
    <header className="flex flex-col gap-3 bg-surface px-4 pt-5 pb-2.5 md:hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold tracking-tight">{section === "all" ? t("nav.vault") : t(SECTION_MESSAGES[section])}</h1>
        <button type="button" onClick={lock} aria-label={t("account.lockNow")} className="grid size-11 cursor-pointer place-items-center rounded-full bg-sunken">
          <Lock size={18} />
        </button>
      </div>
      {search}
      <div role="group" aria-label={t("nav.filter")} className="flex gap-2 overflow-x-auto">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            aria-pressed={section === chip.id}
            onClick={() => onSectionChange(chip.id)}
            className={clsx(
              "shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px]",
              section === chip.id
                ? "border-accent bg-accent font-medium text-on-accent"
                : chip.warn
                  ? "border-warning-line bg-warning-soft font-medium text-warning"
                  : "border-border bg-surface",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </header>
  );
}

export function NewItemButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("list.newItem")}
      className="fixed right-[max(18px,env(safe-area-inset-right))] bottom-[calc(84px+env(safe-area-inset-bottom))] z-10 grid size-14 cursor-pointer place-items-center rounded-2xl bg-accent text-on-accent shadow-pop md:hidden"
    >
      <Plus size={22} strokeWidth={2.4} />
    </button>
  );
}

export function PhoneTabBar({ active, onVault, onGenerator, onHealth, onSettings }: {
  active: "vault" | "health";
  onVault: () => void;
  onGenerator: () => void;
  onHealth: () => void;
  onSettings: () => void;
}) {
  const tabs = [
    { id: "vault", label: t("nav.vault"), icon: <Lock size={21} />, onClick: onVault },
    { id: "generator", label: t("nav.generator"), icon: <Dices size={21} />, onClick: onGenerator },
    { id: "health", label: t("nav.health"), icon: <Activity size={21} />, onClick: onHealth },
    { id: "settings", label: t("account.settings"), icon: <Settings size={21} />, onClick: onSettings },
  ];
  return (
    <nav aria-label={t("nav.main")} className="flex border-t border-border bg-bg px-1.5 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={tab.onClick}
          aria-current={tab.id === active ? "page" : undefined}
          className={clsx(
            "flex min-h-13 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-[11px]",
            tab.id === active ? "font-semibold text-accent" : "text-muted",
          )}
        >
          <span aria-hidden="true">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
