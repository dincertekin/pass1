import { PLANS, type AccountResponse } from "@pass1/shared";
import { clsx } from "clsx";
import { ArrowDownToLine, ArrowLeft, Monitor, ShieldCheck, SlidersHorizontal, UserRound, X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { IconButton } from "../components/ui/IconButton";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Switch } from "../components/ui/Switch";
import { AUTO_LOCK_CHOICES, CLIPBOARD_CLEAR_CHOICES, updateSettings, useSettings } from "../lib/settings";
import { ChangePasswordForm } from "./ChangePassword";
import { DeleteAccountForm } from "./DeleteAccount";
import { DevicesTab } from "./Devices";
import { Select, SettingRow } from "./layout";
import { ExportForm, IMPORT_SOURCES, ImportForm, TransferTab, type ImportSource } from "./Transfer";

export type SettingsTab = "general" | "security" | "account" | "devices" | "transfer";

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "general", label: "General", icon: <SlidersHorizontal size={15} /> },
  { id: "security", label: "Security", icon: <ShieldCheck size={15} /> },
  { id: "account", label: "Account", icon: <UserRound size={15} /> },
  { id: "devices", label: "Devices", icon: <Monitor size={15} /> },
  { id: "transfer", label: "Import & export", icon: <ArrowDownToLine size={15} /> },
];

/** A form that takes over a tab's space: changing the password, importing, exporting, deleting. */
type SettingsPage =
  | { kind: "changePassword" }
  | { kind: "export" }
  | { kind: "import"; source: ImportSource }
  | { kind: "deleteAccount" };

/**
 * Settings, as a dialog over the vault. The vault stays open underneath, so closing Settings
 * puts you back exactly where you were. On phones it fills the screen.
 *
 * Longer tasks (changing the master password, import, export, deleting the account) open as a
 * page inside this window, with a way back to their tab, never as a second window on top.
 */
export function SettingsDialog({ open, onOpenChange, tab, onTabChange, account, vaultKey, onOpenPlans }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  account: AccountResponse;
  vaultKey: CryptoKey;
  onOpenPlans: () => void;
}) {
  const [page, setPage] = useState<SettingsPage | null>(null);
  const current = TABS.find((t) => t.id === tab)!;
  const pageTitle =
    page?.kind === "changePassword"
      ? "Change master password"
      : page?.kind === "export"
        ? "Export your vault"
        : page?.kind === "import"
          ? `Import from ${IMPORT_SOURCES.find((s) => s.id === page.source)!.name}`
          : page?.kind === "deleteAccount"
            ? "Delete your account"
            : null;
  const backToTab = () => setPage(null);

  function changeTab(next: SettingsTab) {
    setPage(null);
    onTabChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPage(null);
        onOpenChange(next);
      }}
      title="Settings"
      size="xl"
      hideHeader
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex shrink-0 flex-col gap-0.5 border-b border-border bg-bg p-2.5 md:w-52.5 md:border-r md:border-b-0 md:py-4.5">
          <div className="flex items-center justify-between px-2.5 pb-2 md:pb-3.5">
            <span className="text-[15px] font-semibold">Settings</span>
            <RadixDialog.Close asChild>
              <IconButton label="Close settings" className="md:hidden">
                <X size={16} />
              </IconButton>
            </RadixDialog.Close>
          </div>
          <div className="flex gap-0.5 overflow-x-auto md:flex-col">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => changeTab(t.id)}
                // A real border, not a ring: the list scrolls sideways on phones, and a ring
                // (drawn outside the box) gets clipped at the list's edges.
                className={clsx(
                  "flex shrink-0 cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[13px]",
                  tab === t.id
                    ? "border-border bg-surface font-medium text-text"
                    : "border-transparent text-muted hover:bg-sunken hover:text-text",
                )}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-auto hidden px-2.5 pt-4 text-[11px] text-muted md:block">Settings marked "this browser" stay on this device.</p>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pt-4.5 pb-2">
            <div className="grid gap-1">
              {page && (
                <button
                  type="button"
                  onClick={backToTab}
                  className="flex cursor-pointer items-center gap-1 justify-self-start text-[13px] text-muted hover:text-text"
                >
                  <ArrowLeft size={14} aria-hidden="true" /> {current.label}
                </button>
              )}
              <h2 className="text-lg font-semibold">{pageTitle ?? current.label}</h2>
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="Close settings" className="hidden md:grid">
                <X size={16} />
              </IconButton>
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {page?.kind === "changePassword" && <ChangePasswordForm email={account.user.email} onDone={backToTab} />}
            {page?.kind === "export" && <ExportForm vaultKey={vaultKey} onDone={backToTab} />}
            {page?.kind === "import" && <ImportForm key={page.source} source={page.source} vaultKey={vaultKey} onClose={backToTab} />}
            {page?.kind === "deleteAccount" && <DeleteAccountForm email={account.user.email} onCancel={backToTab} />}

            {!page && tab === "general" && <GeneralTab />}
            {!page && tab === "security" && <SecurityTab onChangePassword={() => setPage({ kind: "changePassword" })} />}
            {!page && tab === "account" && (
              <AccountTab account={account} onOpenPlans={onOpenPlans} onDelete={() => setPage({ kind: "deleteAccount" })} />
            )}
            {!page && tab === "devices" && <DevicesTab />}
            {!page && tab === "transfer" && (
              <TransferTab onImport={(source) => setPage({ kind: "import", source })} onExport={() => setPage({ kind: "export" })} />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function GeneralTab() {
  const settings = useSettings();
  return (
    <div>
      <SettingRow label="Appearance" hint="Follows your system unless you choose.">
        <SegmentedControl
          label="Appearance"
          value={settings.theme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          onChange={(theme) => updateSettings({ theme })}
        />
      </SettingRow>
      <SettingRow label="Density" hint="Compact fits more items on screen.">
        <Select
          label="Density"
          value={settings.density}
          options={[
            ["comfortable", "Comfortable"],
            ["compact", "Compact"],
          ]}
          onChange={(density) => updateSettings({ density })}
        />
      </SettingRow>
      <SettingRow label="Colored item tiles" hint="Colored initials. Real site icons would tell a third party which sites you use.">
        <Switch label="Colored item tiles" checked={settings.colorfulTiles} onChange={(colorfulTiles) => updateSettings({ colorfulTiles })} />
      </SettingRow>
    </div>
  );
}

function SecurityTab({ onChangePassword }: { onChangePassword: () => void }) {
  const settings = useSettings();
  return (
    <div>
      <SettingRow label="Lock after" hint="Without activity. Closing the tab always locks. This browser only.">
        <Select
          label="Lock after"
          value={settings.autoLockMinutes}
          options={AUTO_LOCK_CHOICES.map((m) => [m, m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : `${m / 60} hour${m === 60 ? "" : "s"}`])}
          onChange={(autoLockMinutes) => updateSettings({ autoLockMinutes })}
        />
      </SettingRow>
      <SettingRow label="Clear clipboard after" hint="Applies to everything you copy. This browser only.">
        <Select
          label="Clear clipboard after"
          value={settings.clipboardClearSeconds}
          options={CLIPBOARD_CLEAR_CHOICES.map((s) => [s, s < 60 ? `${s} seconds` : `${s / 60} minute${s === 60 ? "" : "s"}`])}
          onChange={(clipboardClearSeconds) => updateSettings({ clipboardClearSeconds })}
        />
      </SettingRow>
      <SettingRow label="Lock when this tab is hidden" hint="Stricter: switching tabs or apps locks the vault. This browser only.">
        <Switch label="Lock when this tab is hidden" checked={settings.lockWhenHidden} onChange={(lockWhenHidden) => updateSettings({ lockWhenHidden })} />
      </SettingRow>
      <SettingRow label="Master password" hint="Changing it logs out your other devices. Your items aren't re-encrypted, so it's quick.">
        <Button variant="secondary" onClick={onChangePassword}>
          Change…
        </Button>
      </SettingRow>
    </div>
  );
}

function AccountTab({ account, onOpenPlans, onDelete }: { account: AccountResponse; onOpenPlans: () => void; onDelete: () => void }) {
  const { email, plan } = account.user;
  return (
    <div className="grid gap-7">
      <div>
        <SettingRow label="Email" hint={email} />
        <SettingRow label="Plan" hint={PLANS[plan].name}>
          {plan !== "unlimited" && <Button onClick={onOpenPlans}>{plan === "free" ? "Get pass1 Plus" : "See plans"}</Button>}
        </SettingRow>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line px-4 py-3.5">
        <div className="grid gap-0.5">
          <span className="font-medium text-danger">Delete account</span>
          <span className="text-xs text-muted">Deletes your vault from pass1 for good. Export it first if you want a copy.</span>
        </div>
        <Button variant="danger" onClick={onDelete}>
          Delete account…
        </Button>
      </div>
    </div>
  );
}
