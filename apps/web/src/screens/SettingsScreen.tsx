import { PLANS, type AccountResponse } from "@pass1/shared";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "../components/Logo";
import { AUTO_LOCK_CHOICES, CLIPBOARD_CLEAR_CHOICES, updateSettings, useSettings } from "../lib/settings";

export function SettingsScreen({ account }: { account: AccountResponse }) {
  const settings = useSettings();

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
            <span className="text-[13px]">{account.user.email}</span>
          </Row>
          <Row label="Plan">
            <span className="text-[13px]">{PLANS[account.user.plan].name}</span>
          </Row>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{title}</h2>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <div className="grid gap-0.5">
        <span className="text-[13px] font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Select<T extends number>({ label, value, options, onChange }: {
  /** Read by screen readers; the visible label is in the row. */
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as T)}
      className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px] focus:border-accent focus:ring-3 focus:ring-accent-soft focus:outline-none"
    >
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}
