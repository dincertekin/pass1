import { PLANS, type AccountResponse } from "@pass1/shared";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { Logo } from "../components/Logo";
import { AUTO_LOCK_CHOICES, CLIPBOARD_CLEAR_CHOICES, updateSettings, useSettings } from "../lib/settings";
import { ChangePassword } from "../settings/ChangePassword";
import { DeleteAccount } from "../settings/DeleteAccount";
import { Devices } from "../settings/Devices";
import { Row, Section, Select } from "../settings/layout";
import { Transfer } from "../settings/Transfer";

export function SettingsScreen({ account, vaultKey }: { account: AccountResponse; vaultKey: CryptoKey }) {
  const settings = useSettings();
  const { email, plan } = account.user;

  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-4 py-3">
        <Link to="/vault" className="flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
          <ArrowLeft size={14} /> Vault
        </Link>
        <Logo />
      </header>

      <main className="mx-auto grid max-w-xl gap-8 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        <Section title="Security" note="These apply to this browser only.">
          <Row label="Lock after" hint="Without any activity. Closing or reloading the tab always locks.">
            <Select
              label="Lock after"
              value={settings.autoLockMinutes}
              options={AUTO_LOCK_CHOICES.map((m) => [m, m < 60 ? `${m} minute${m === 1 ? "" : "s"}` : `${m / 60} hour${m === 60 ? "" : "s"}`])}
              onChange={(autoLockMinutes) => updateSettings({ autoLockMinutes })}
            />
          </Row>
          <Row label="Clear clipboard after" hint="Applies to everything you copy from the vault.">
            <Select
              label="Clear clipboard after"
              value={settings.clipboardClearSeconds}
              options={CLIPBOARD_CLEAR_CHOICES.map((s) => [s, s < 60 ? `${s} seconds` : `${s / 60} minute${s === 60 ? "" : "s"}`])}
              onChange={(clipboardClearSeconds) => updateSettings({ clipboardClearSeconds })}
            />
          </Row>
        </Section>

        <Section title="Account">
          <Row label="Email">
            <span className="text-[13px]">{email}</span>
          </Row>
          <Row label="Plan">
            <span className="text-[13px]">{PLANS[plan].name}</span>
          </Row>
        </Section>

        <ChangePassword email={email} />
        {/* A password change ends the other sessions, so reload the list when it happens. */}
        <Devices key={account.kdfSalt} />
        <Transfer vaultKey={vaultKey} />
        <DeleteAccount email={email} />
      </main>
    </div>
  );
}
