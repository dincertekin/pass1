import type { AccountResponse } from "@pass1/shared";
import { clsx } from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { inSection, matchesQuery, sortByName, type Section } from "../vault/entries";
import { ItemDetail } from "../vault/ItemDetail";
import { ItemEditor } from "../vault/ItemEditor";
import { ItemList } from "../vault/ItemList";
import { MobileBar, Sidebar } from "../vault/Sidebar";
import { useVault, VaultProvider } from "../vault/vault-store";

export function VaultScreen({ account, vaultKey }: { account: AccountResponse; vaultKey: CryptoKey }) {
  return (
    <VaultProvider vaultKey={vaultKey}>
      <Vault account={account} />
    </VaultProvider>
  );
}

// Three panes on desktop: sections, the item list, and the selected item.
// On phones only one pane shows at a time: the list, or the item you opened.
function Vault({ account }: { account: AccountResponse }) {
  const { entries, loadError, reload } = useVault();
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "existing" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const visible = useMemo(
    () => (entries ?? []).filter((e) => inSection(e, section) && matchesQuery(e, query)).sort(sortByName),
    [entries, section, query],
  );
  const selected = visible.find((e) => e.id === selectedId) ?? null;

  // "/" or Cmd/Ctrl+K jumps to search from anywhere, except while typing in another field.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea");
      if ((e.key === "/" && !typing) || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function changeSection(next: Section) {
    setSection(next);
    setSelectedId(null);
    setEditing(null);
  }

  function select(id: string) {
    setSelectedId(id);
    setEditing(null);
  }

  if (loadError) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="grid max-w-sm gap-3">
          <Alert>{loadError}</Alert>
          <Button variant="secondary" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (!entries) {
    return <main className="min-h-dvh bg-bg" aria-busy="true" aria-label="Decrypting vault" />;
  }

  const showDetailOnPhone = editing !== null || selected !== null;

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] md:grid-cols-[200px_minmax(240px,320px)_1fr] md:grid-rows-1">
      <Sidebar
        entries={entries}
        section={section}
        onSectionChange={changeSection}
        email={account.user.email}
        plan={account.user.plan}
      />
      <MobileBar section={section} onSectionChange={changeSection} />

      <div className={clsx("min-h-0 min-w-0 flex-col bg-surface md:flex", showDetailOnPhone ? "hidden" : "flex")}>
        <ItemList
          entries={visible}
          section={section}
          query={query}
          onQueryChange={setQuery}
          selectedId={selectedId}
          onSelect={select}
          onOpen={() => headingRef.current?.focus()}
          onNew={() => {
            setSelectedId(null);
            setEditing("new");
          }}
          searchRef={searchRef}
        />
      </div>

      <div className={clsx("min-h-0 min-w-0 bg-bg md:grid", showDetailOnPhone ? "grid" : "hidden")}>
        {editing ? (
          <ItemEditor
            key={editing === "new" ? "new" : selected?.id}
            entry={editing === "existing" ? selected : null}
            onSaved={(id) => {
              // Make sure a new item is visible: it may not match the current section or search.
              if (editing === "new") {
                setSection("all");
                setQuery("");
              }
              setSelectedId(id);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : selected ? (
          <ItemDetail
            key={selected.id}
            entry={selected}
            onEdit={() => setEditing("existing")}
            onBack={() => setSelectedId(null)}
            headingRef={headingRef}
          />
        ) : (
          <p className="hidden place-self-center text-[13px] text-muted md:block">Select an item to see its details.</p>
        )}
      </div>
    </div>
  );
}
