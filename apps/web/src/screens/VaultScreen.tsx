import type { AccountResponse } from "@pass1/shared";
import { clsx } from "clsx";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { copySecret } from "../lib/clipboard";
import { updateSettings, useSettings } from "../lib/settings";
import { useSession } from "../session/session";
import { PlansDialog } from "../settings/PlansDialog";
import { SettingsDialog, type SettingsTab } from "../settings/SettingsDialog";
import { inSection, matchesQuery, sortByName, type Section } from "../vault/entries";
import { FirstRun } from "../vault/FirstRun";
import { hasIssue, useVaultHealth } from "../vault/health";
import { ItemDetail } from "../vault/ItemDetail";
import { ItemEditor } from "../vault/ItemEditor";
import { ItemList } from "../vault/ItemList";
import { PaneResizer } from "../vault/PaneResizer";
import { GeneratorPanel } from "../vault/PasswordGenerator";
import { NewItemButton, PhoneHeader, PhoneTabBar } from "../vault/PhoneNav";
import { Sidebar } from "../vault/Sidebar";
import { useVault, VaultProvider } from "../vault/vault-store";

export function VaultScreen({ account, vaultKey }: { account: AccountResponse; vaultKey: CryptoKey }) {
  return (
    <VaultProvider vaultKey={vaultKey}>
      <Vault account={account} vaultKey={vaultKey} />
    </VaultProvider>
  );
}

// Desktop: sidebar, item list and the selected item side by side.
// Phone: one screen at a time (the list, or the item you opened) with a tab bar at the bottom.
// Settings and Plans are dialogs over this screen, so the vault never closes underneath them.
function Vault({ account, vaultKey }: { account: AccountResponse; vaultKey: CryptoKey }) {
  const { entries, loadError, reload } = useVault();
  const { lock } = useSession();
  const [section, setSection] = useState<Section>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "existing" | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // The saved width, plus a live value while dragging (saved once the drag ends).
  const savedListWidth = useSettings().listWidth;
  const [draggedListWidth, setDraggedListWidth] = useState<number | null>(null);
  const listWidth = draggedListWidth ?? savedListWidth;

  const health = useVaultHealth(entries ?? []);
  const visible = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => inSection(e, section, hasIssue(health.get(e.id))) && matchesQuery(e, query))
        .sort(sortByName),
    [entries, section, query, health],
  );
  const counts = useMemo(() => {
    const all = entries ?? [];
    const count = (s: Section) => all.filter((e) => inSection(e, s, hasIssue(health.get(e.id)))).length;
    return { all: count("all"), favorites: count("favorites"), health: count("health"), trash: count("trash") };
  }, [entries, health]);
  const selected = visible.find((e) => e.id === selectedId) ?? null;

  // Keyboard: "/" or ⌘K search, ⌘, Settings, ⌘L lock. Single keys don't fire while typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select");
      const mod = e.metaKey || e.ctrlKey;
      if ((e.key === "/" && !typing) || (mod && e.key === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsTab((tab) => tab ?? "general");
      } else if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lock();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lock]);

  function changeSection(next: Section) {
    setSection(next);
    setSelectedId(null);
    setEditing(null);
  }

  function select(id: string) {
    setSelectedId(id);
    setEditing(null);
  }

  function startNew() {
    setSelectedId(null);
    setEditing("new");
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

  // Only on "All items": someone emptying their trash should stay in the trash.
  const firstRun = entries.length === 0 && editing === null && section === "all";
  const showDetailOnPhone = editing !== null || selected !== null;

  const search = (
    <label className="flex h-11 items-center gap-2 rounded-lg bg-sunken px-3">
      <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
      <input
        type="search"
        placeholder={`Search ${counts.all} item${counts.all === 1 ? "" : "s"}`}
        aria-label="Search vault"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
      />
    </label>
  );

  return (
    <div className="flex h-dvh">
      <Sidebar
        entries={entries}
        counts={counts}
        section={section}
        onSectionChange={changeSection}
        email={account.user.email}
        plan={account.user.plan}
        onOpenSettings={() => setSettingsTab("general")}
        onOpenPlans={() => setPlansOpen(true)}
      />

      {firstRun ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <FirstRun
            itemCount={entries.length}
            onImport={() => setSettingsTab("transfer")}
            onAdd={startNew}
            onGenerate={() => setGeneratorOpen(true)}
          />
          <PhoneTabBar
            active="vault"
            onVault={() => changeSection("all")}
            onGenerator={() => setGeneratorOpen(true)}
            onHealth={() => changeSection("health")}
            onSettings={() => setSettingsTab("general")}
          />
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            className={clsx("min-h-0 min-w-0 flex-1 flex-col md:flex md:w-(--list-width) md:flex-none", showDetailOnPhone ? "hidden" : "flex")}
            style={{ "--list-width": `${listWidth}px` } as CSSProperties}
          >
            <PhoneHeader section={section} counts={counts} onSectionChange={changeSection} search={search} />
            <ItemList
              entries={visible}
              total={counts.all}
              health={health}
              section={section}
              query={query}
              onQueryChange={setQuery}
              selectedId={selectedId}
              onSelect={select}
              onOpen={() => headingRef.current?.focus()}
              onNew={startNew}
              searchRef={searchRef}
            />
            {section !== "trash" && <NewItemButton onClick={startNew} />}
            <PhoneTabBar
              active={section === "health" ? "health" : "vault"}
              onVault={() => changeSection("all")}
              onGenerator={() => setGeneratorOpen(true)}
              onHealth={() => changeSection("health")}
              onSettings={() => setSettingsTab("general")}
            />
          </div>

          <PaneResizer
            width={listWidth}
            listLeft={() => listRef.current?.getBoundingClientRect().left ?? 0}
            onResize={setDraggedListWidth}
            onResizeEnd={(width) => {
              updateSettings({ listWidth: width });
              setDraggedListWidth(null);
            }}
          />

          {/* A column, so the item view or editor stretches to the full width of this pane. */}
          <div className={clsx("min-h-0 min-w-0 flex-1 flex-col bg-bg md:flex", showDetailOnPhone ? "flex" : "hidden")}>
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
                health={health.get(selected.id)}
                onEdit={() => setEditing("existing")}
                onBack={() => setSelectedId(null)}
                headingRef={headingRef}
              />
            ) : (
              <p className="m-auto hidden text-[13px] text-muted md:block">Select an item to see its details.</p>
            )}
          </div>
        </>
      )}

      <SettingsDialog
        open={settingsTab !== null}
        onOpenChange={(open) => !open && setSettingsTab(null)}
        tab={settingsTab ?? "general"}
        onTabChange={setSettingsTab}
        account={account}
        vaultKey={vaultKey}
        // Swap Settings for the plans instead of stacking one dialog on top of the other.
        onOpenPlans={() => {
          setSettingsTab(null);
          setPlansOpen(true);
        }}
      />
      <PlansDialog open={plansOpen} onOpenChange={setPlansOpen} currentPlan={account.user.plan} />
      <Dialog open={generatorOpen} onOpenChange={setGeneratorOpen} title="Password generator" size="sm">
        <div className="overflow-y-auto px-5 pt-2 pb-5">
          <GeneratorPanel
            action="copy"
            onUse={(value) => {
              void copySecret(value, "Password");
              setGeneratorOpen(false);
            }}
          />
        </div>
      </Dialog>
    </div>
  );
}
