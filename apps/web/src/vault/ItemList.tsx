import { clsx } from "clsx";
import { Plus, Search, Star } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";
import { Button } from "../components/ui/Button";
import { useSettings } from "../lib/settings";
import { MOD_KEY } from "../lib/shortcuts";
import { hostOf, SECTION_MESSAGES, type Section } from "@pass1/core";
import type { ItemHealth } from "@pass1/core";
import { HealthChip } from "./HealthChip";
import { ItemAvatar } from "./ItemAvatar";
import type { VaultEntry } from "@pass1/core";
import { t } from "../lib/i18n";
import { itemName } from "./item-name";

export function ItemList({ entries, total, health, section, query, onQueryChange, selectedId, onSelect, onOpen, onNew, searchRef }: {
  entries: VaultEntry[];
  /** Items in the whole vault, for the search placeholder. */
  total: number;
  health: Map<string, ItemHealth>;
  section: Section;
  query: string;
  onQueryChange: (query: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Enter in the search box: move focus to the selected item's details. */
  onOpen: () => void;
  onNew: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const { density } = useSettings();

  // Arrow keys move through the results without leaving the search box.
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const index = entries.findIndex((entry) => entry.id === selectedId);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(index + 1, entries.length - 1) : Math.max(index - 1, 0);
      if (entries[next]) onSelect(entries[next].id);
    } else if (e.key === "Enter" && selectedId) {
      e.preventDefault();
      onOpen();
    } else if (e.key === "Escape") {
      onQueryChange("");
    }
  }

  return (
    <section aria-label={t("list.items")} className="flex min-h-0 min-w-0 flex-1 flex-col border-border bg-surface md:border-r">
      {/* Phones have their own search in PhoneHeader, so this row is desktop only. */}
      <div className="hidden gap-2 border-b border-border p-3 md:flex">
        <label className="flex h-8.5 flex-1 items-center gap-2 rounded-md border border-border-strong bg-surface px-2.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            placeholder={t("list.search", { count: total })}
            aria-label={t("list.searchLabel")}
            autoComplete="off"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
          <kbd className="rounded-sm border border-border px-1 font-mono text-[11px] text-muted">{MOD_KEY}K</kbd>
        </label>
        {/* Desktop only; phones get the floating button. Wrapped, because the Button's own
            display class would otherwise win over `hidden`. */}
        {section !== "trash" && (
          <div className="hidden md:block">
            <Button onClick={onNew} aria-label={t("list.newItem")} className="h-8.5">
              <Plus size={15} strokeWidth={2.4} /> {t("list.new")}
            </Button>
          </div>
        )}
      </div>

      <div className="hidden items-baseline justify-between px-4 pt-3.5 pb-1.5 md:flex">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{query ? t("list.searchResults") : t(SECTION_MESSAGES[section])}</h2>
        <span className="text-xs text-muted">{t("list.sortedByName")}</span>
      </div>

      <div role="listbox" aria-label="Vault items" className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
        {entries.length === 0 ? (
          <EmptyList section={section} query={query} />
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="option"
              aria-selected={entry.id === selectedId}
              onClick={() => onSelect(entry.id)}
              className={clsx(
                "grid w-full cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 text-left",
                density === "compact" ? "py-1" : "py-2",
                entry.id === selectedId ? "bg-accent-soft" : "hover:bg-sunken",
              )}
            >
              <ItemAvatar entry={entry} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{itemName(entry)}</span>
                <span className="block truncate text-xs text-muted">
                  {entry.item?.username || hostOf(entry.item?.url) || " "}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <HealthChip health={health.get(entry.id)} problemsOnly />
                {entry.item?.favorite && <Star size={12} className="fill-accent text-accent" aria-label={t("list.favorite")} />}
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function EmptyList({ section, query }: { section: Section; query: string }) {
  const message = query
    ? t("list.noMatches", { query })
    : section === "trash"
      ? t("list.trashEmpty")
      : section === "favorites"
        ? t("list.noFavorites")
        : section === "health"
          ? t("list.nothingToFix")
          : t("list.vaultEmpty");
  return <p className="px-3 py-8 text-center text-[13px] text-muted">{message}</p>;
}
