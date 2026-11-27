import { PLANS, type AccountResponse, type BillingStatusResponse } from "@pass1/shared";
import { clsx } from "clsx";
import { ArrowDownToLine, ArrowLeft, Monitor, ShieldCheck, SlidersHorizontal, UserRound, X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { IconButton } from "../components/ui/IconButton";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Switch } from "../components/ui/Switch";
import { openBillingPortal, useBilling } from "../lib/billing";
import { AUTO_LOCK_CHOICES, CLIPBOARD_CLEAR_CHOICES, updateSettings, useSettings } from "../lib/settings";
import { errorMessage } from "../session/session";
import { ChangePasswordForm } from "./ChangePassword";
import { DeleteAccountForm } from "./DeleteAccount";
import { DevicesTab } from "./Devices";
import { Outcome, Select, SettingRow } from "./layout";
import { ExportForm, IMPORT_SOURCES, ImportForm, TransferTab, type ImportSource } from "./Transfer";
import { t } from "../lib/i18n";

export type SettingsTab = "general" | "security" | "account" | "devices" | "transfer";

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: "general", label: t("settings.tabGeneral"), icon: <SlidersHorizontal size={15} /> },
  { id: "security", label: t("settings.tabSecurity"), icon: <ShieldCheck size={15} /> },
  { id: "account", label: t("settings.tabAccount"), icon: <UserRound size={15} /> },
  { id: "devices", label: t("settings.tabDevices"), icon: <Monitor size={15} /> },
  { id: "transfer", label: t("settings.tabTransfer"), icon: <ArrowDownToLine size={15} /> },
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
      ? t("settings.changePasswordTitle")
      : page?.kind === "export"
        ? t("settings.exportTitle")
        : page?.kind === "import"
          ? t("settings.importTitle", { source: IMPORT_SOURCES.find((s) => s.id === page.source)!.name })
          : page?.kind === "deleteAccount"
            ? t("settings.deleteTitle")
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
      title={t("settings.title")}
      size="xl"
      hideHeader
    >
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex shrink-0 flex-col gap-0.5 border-b border-border bg-bg p-2.5 md:w-52.5 md:border-r md:border-b-0 md:py-4.5">
          <div className="flex items-center justify-between px-2.5 pb-2 md:pb-3.5">
            <span className="text-[15px] font-semibold">{t("settings.title")}</span>
            <RadixDialog.Close asChild>
              <IconButton label={t("settings.close")} className="md:hidden">
                <X size={16} />
              </IconButton>
            </RadixDialog.Close>
          </div>
          <div className="flex gap-0.5 overflow-x-auto md:flex-col">
            {TABS.map((tabInfo) => (
              <button
                key={tabInfo.id}
                type="button"
                aria-current={tab === tabInfo.id ? "page" : undefined}
                onClick={() => changeTab(tabInfo.id)}
                // A real border, not a ring: the list scrolls sideways on phones, and a ring
                // (drawn outside the box) gets clipped at the list's edges.
                className={clsx(
                  "flex shrink-0 cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-[13px]",
                  tab === tabInfo.id
                    ? "border-border bg-surface font-medium text-text"
                    : "border-transparent text-muted hover:bg-sunken hover:text-text",
                )}
              >
                <span aria-hidden="true">{tabInfo.icon}</span>
                {tabInfo.label}
              </button>
            ))}
          </div>
          <p className="mt-auto hidden px-2.5 pt-4 text-[11px] text-muted md:block">{t("settings.browserOnlyNote")}</p>
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
              <IconButton label={t("settings.close")} className="hidden md:grid">
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
      <SettingRow label={t("settings.appearance")} hint={t("settings.appearanceHint")}>
        <SegmentedControl
          label={t("settings.appearance")}
          value={settings.theme}
          options={[
            { value: "system", label: t("settings.system") },
            { value: "light", label: t("settings.light") },
            { value: "dark", label: t("settings.dark") },
          ]}
          onChange={(theme) => updateSettings({ theme })}
        />
      </SettingRow>
      <SettingRow label={t("settings.density")} hint={t("settings.densityHint")}>
        <Select
          label={t("settings.density")}
          value={settings.density}
          options={[
            ["comfortable", t("settings.comfortable")],
            ["compact", t("settings.compact")],
          ]}
          onChange={(density) => updateSettings({ density })}
        />
      </SettingRow>
      <SettingRow label={t("settings.coloredTiles")} hint={t("settings.coloredTilesHint")}>
        <Switch label={t("settings.coloredTiles")} checked={settings.colorfulTiles} onChange={(colorfulTiles) => updateSettings({ colorfulTiles })} />
      </SettingRow>
    </div>
  );
}

function SecurityTab({ onChangePassword }: { onChangePassword: () => void }) {
  const settings = useSettings();
  return (
    <div>
      <SettingRow label={t("settings.lockAfter")} hint={t("settings.lockAfterHint")}>
        <Select
          label={t("settings.lockAfter")}
          value={settings.autoLockMinutes}
          options={AUTO_LOCK_CHOICES.map((m) => [m, m < 60 ? t("time.minutes", { count: m }) : t("time.hours", { count: m / 60 })])}
          onChange={(autoLockMinutes) => updateSettings({ autoLockMinutes })}
        />
      </SettingRow>
      <SettingRow label={t("settings.clearClipboard")} hint={t("settings.clearClipboardHint")}>
        <Select
          label={t("settings.clearClipboard")}
          value={settings.clipboardClearSeconds}
          options={CLIPBOARD_CLEAR_CHOICES.map((s) => [s, s < 60 ? t("time.seconds", { count: s }) : t("time.minutes", { count: s / 60 })])}
          onChange={(clipboardClearSeconds) => updateSettings({ clipboardClearSeconds })}
        />
      </SettingRow>
      <SettingRow label={t("settings.lockWhenHidden")} hint={t("settings.lockWhenHiddenHint")}>
        <Switch label={t("settings.lockWhenHidden")} checked={settings.lockWhenHidden} onChange={(lockWhenHidden) => updateSettings({ lockWhenHidden })} />
      </SettingRow>
      <SettingRow label={t("common.masterPassword")} hint={t("settings.masterPasswordHint")}>
        <Button variant="secondary" onClick={onChangePassword}>
          {t("settings.change")}
        </Button>
      </SettingRow>
    </div>
  );
}

function AccountTab({ account, onOpenPlans, onDelete }: { account: AccountResponse; onOpenPlans: () => void; onDelete: () => void }) {
  const { email, plan, id } = account.user;
  const billing = useBilling(id);
  const sub = billing?.subscription;
  const [error, setError] = useState<string | null>(null);

  async function manage() {
    setError(null);
    try {
      await openBillingPortal(); // navigates to Paddle
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="grid gap-7">
      <div>
        <SettingRow label={t("common.email")} hint={email} />
        <SettingRow label={t("settings.plan")} hint={<PlanSummary planName={PLANS[plan].name} subscription={sub ?? null} />}>
          {sub && sub.status !== "canceled" ? (
            <Button variant="secondary" onClick={() => void manage()}>
              {t("settings.manageSubscription")}
            </Button>
          ) : (
            plan !== "unlimited" && <Button onClick={onOpenPlans}>{plan === "free" ? t("settings.getPlus") : t("settings.seePlans")}</Button>
          )}
        </SettingRow>
        {sub?.status === "past_due" && (
          <Alert tone="warning">
            {t("settings.paymentFailed", { plan: PLANS[sub.plan].name })}
          </Alert>
        )}
        {error && <Outcome tone="danger">{error}</Outcome>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line px-4 py-3.5">
        <div className="grid gap-0.5">
          <span className="font-medium text-danger">{t("settings.deleteAccount")}</span>
          <span className="text-xs text-muted">
            {sub && sub.status !== "canceled" ? t("settings.deleteAccountHintWithSubscription") : t("settings.deleteAccountHint")}
          </span>
        </div>
        <Button variant="danger" onClick={onDelete}>
          {t("settings.deleteAccountButton")}
        </Button>
      </div>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** "pass1 Plus · yearly · renews 1 Oct 2027", or when it ends. */
function PlanSummary({ planName, subscription }: { planName: string; subscription: BillingStatusResponse["subscription"] }) {
  if (!subscription || subscription.status === "canceled") return <>{planName}</>;
  const period = subscription.interval === "year" ? t("plan.yearly") : t("plan.monthly");
  const when = subscription.cancelsAt
    ? t("plan.ends", { date: dateFormat.format(subscription.cancelsAt) })
    : subscription.currentPeriodEndsAt
      ? t("plan.renews", { date: dateFormat.format(subscription.currentPeriodEndsAt) })
      : null;
  return <>{[planName, period, when].filter(Boolean).join(" · ")}</>;
}
