import { clsx } from "clsx";
import { Plus, Search } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";
import { Button } from "../components/ui/Button";
import { displayName, hostOf, type Section } from "./entries";
import { ItemAvatar } from "./ItemAvatar";
import type { VaultEntry } from "./vault-store";

export function ItemList({ entries, section, query, onQueryChange, selectedId, onSelect, onOpen, onNew, searchRef }: {
  entries: VaultEntry[];
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
    <section aria-label="Items" className="flex min-h-0 min-w-0 flex-1 flex-col border-border md:border-r">
      <div className="flex gap-2 border-b border-border p-2.5">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-md border border-border-strong bg-surface px-2 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent-soft">
          <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search vault"
            aria-label="Search vault"
            autoComplete="off"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
          <kbd className="hidden rounded-sm border border-border bg-sunken px-1 font-mono text-[11px] text-muted sm:inline">/</kbd>
        </div>
        {section !== "trash" && (
          <Button size="md" onClick={onNew} aria-label="New item" title="New item" className="px-2">
            <Plus size={16} />
          </Button>
        )}
      </div>

      <div role="listbox" aria-label="Vault items" className="min-h-0 flex-1 overflow-y-auto p-1">
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
                "grid w-full cursor-pointer grid-cols-[28px_1fr] items-center gap-2.5 rounded-sm px-2 py-1.5 text-left",
                entry.id === selectedId ? "bg-accent-soft" : "hover:bg-sunken",
              )}
            >
              <ItemAvatar entry={entry} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{displayName(entry)}</span>
                <span className="block truncate text-xs text-muted">
                  {entry.item?.username || hostOf(entry.item?.url) || " "}
                </span>
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
    ? `No items match "${query}".`
    : section === "trash"
      ? "Trash is empty."
      : section === "favorites"
        ? "Star an item to keep it here."
        : "Your vault is empty. Add your first login with the + button.";
  return <p className="px-3 py-8 text-center text-[13px] text-muted">{message}</p>;
}
