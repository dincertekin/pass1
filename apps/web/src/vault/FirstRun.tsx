import { Check, Dices, Download, Lock, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { updateSettings, useSettings } from "../lib/settings";
import { tileStyle } from "./tiles";

// What a new account sees instead of an empty list. Most people switch password managers
// because importing is easy, so importing comes first.

export function FirstRun({ itemCount, onImport, onAdd, onGenerate }: {
  itemCount: number;
  onImport: () => void;
  onAdd: () => void;
  onGenerate: () => void;
}) {
  const { onboarding } = useSettings();
  const steps = [
    { label: "Create your account", done: true },
    { label: "Import or add 5 passwords", done: itemCount >= 5 },
    { label: "Store your master password somewhere safe offline", done: onboarding.storedMasterPassword, key: "storedMasterPassword" as const },
    { label: "Log in on your phone", done: onboarding.loggedInOnPhone, key: "loggedInOnPhone" as const },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto px-5 py-10 md:px-12 md:py-16">
      <div className="flex w-full max-w-205 flex-col gap-8">
        <header className="flex flex-col gap-2.5">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-success/30 bg-success-soft py-1 pr-3 pl-2 text-xs font-semibold text-success">
            <Lock size={14} aria-hidden="true" /> Your vault is encrypted on this device
          </span>
          <h1 className="text-[28px] font-bold tracking-tight text-balance md:text-[34px]">Welcome to pass1. Let's fill your vault.</h1>
          <p className="max-w-[60ch] text-[15px] text-muted">
            Most people start by importing from the browser or the password manager they already use. It takes about a minute, and pass1
            never sees your passwords in plain text.
          </p>
        </header>

        <div className="grid gap-3.5 md:grid-cols-3">
          <StartCard
            primary
            icon={<Download size={20} />}
            title="Import passwords"
            text="From Chrome, Safari, Bitwarden, 1Password or a CSV file."
            onClick={onImport}
          >
            <span className="mt-1 flex gap-1.5" aria-hidden="true">
              {["Chrome", "Bitwarden", "1Password"].map((name) => (
                <span key={name} className="grid size-6.5 place-items-center rounded-md text-xs font-semibold" style={tileStyle(name, true)}>
                  {name.charAt(0)}
                </span>
              ))}
              <span className="grid size-6.5 place-items-center rounded-md bg-sunken text-[11px] font-semibold text-muted">csv</span>
            </span>
          </StartCard>
          <StartCard icon={<Plus size={20} />} title="Add a login" text="Type in one account by hand. Your email is a good first one." onClick={onAdd} />
          <StartCard icon={<Dices size={20} />} title="Generate a password" text="Changing a weak password today? Make a strong one here." onClick={onGenerate} />
        </div>

        <section aria-label="Getting started" className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface px-5 py-4.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Getting started</span>
            <span className="text-xs text-muted">
              {doneCount} of {steps.length} done
            </span>
          </div>
          <div className="h-1 rounded-full bg-sunken" aria-hidden="true">
            <div className="h-1 rounded-full bg-success" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ul className="grid gap-x-6 gap-y-2.5 text-[13px] md:grid-cols-2">
            {steps.map((step) => (
              <li key={step.label}>
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={step.done}
                    // The first two steps pass1 checks itself; the others people tick off.
                    disabled={!step.key}
                    onChange={(e) => step.key && updateSettings({ onboarding: { ...onboarding, [step.key]: e.target.checked } })}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="grid size-4.5 shrink-0 place-items-center rounded-full border-[1.5px] border-border-strong peer-checked:border-success peer-checked:bg-success peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                  >
                    {step.done && <Check size={11} strokeWidth={3} className="text-surface" />}
                  </span>
                  <span className={step.done ? "text-muted line-through" : undefined}>{step.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function StartCard({ icon, title, text, onClick, primary, children }: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
  primary?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-surface p-5 text-left hover:shadow-pop " +
        (primary ? "border-accent ring-1 ring-accent" : "border-border hover:border-border-strong")
      }
    >
      <span aria-hidden="true" className={"grid size-10 place-items-center rounded-lg " + (primary ? "bg-accent text-on-accent" : "bg-accent-soft text-accent")}>
        {icon}
      </span>
      <span className="text-base font-semibold">{title}</span>
      <span className="text-[13px] text-muted">{text}</span>
      {children}
    </button>
  );
}
