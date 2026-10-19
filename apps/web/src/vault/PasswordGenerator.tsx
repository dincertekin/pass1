import { PASSPHRASE_WORDS, PASSWORD_LENGTH, type PassphraseOptions, type PasswordOptions } from "@pass1/crypto";
import { clsx } from "clsx";
import { Dices, RefreshCw } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { IconButton } from "../components/ui/IconButton";
import { updateSettings, useSettings } from "../lib/settings";

type Generator = typeof import("@pass1/crypto/generator");

/** The dice button inside the password field, and the popover it opens. */
export function PasswordGenerator({ onUse }: { onUse: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton label="Generate password">
          <Dices size={16} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="z-30 w-[min(340px,calc(100vw-32px))] rounded-lg border border-border bg-surface p-4 shadow-pop"
        >
          <GeneratorPanel
            onUse={(value) => {
              onUse(value);
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The generator itself. `action: "copy"` is for the standalone generator (phone tab bar). */
export function GeneratorPanel({ onUse, action = "use" }: { onUse: (value: string) => void; action?: "use" | "copy" }) {
  const settings = useSettings();
  const { generatorKind: kind, passwordOptions, passphraseOptions } = settings;
  const [generator, setGenerator] = useState<Generator | null>(null);
  const [value, setValue] = useState("");

  // The wordlist is 60 KB, so the generator loads the first time this panel opens.
  useEffect(() => {
    void import("@pass1/crypto/generator").then(setGenerator);
  }, []);

  function regenerate() {
    if (!generator) return;
    setValue(kind === "password" ? generator.generatePassword(passwordOptions) : generator.generatePassphrase(passphraseOptions));
  }

  // A new value whenever the options change. The options object is replaced on every
  // change, so comparing by identity is enough.
  useEffect(regenerate, [generator, kind, passwordOptions, passphraseOptions]);

  const bits = !generator
    ? 0
    : kind === "password"
      ? generator.passwordEntropyBits(passwordOptions)
      : generator.passphraseEntropyBits(passphraseOptions);

  const setPassword = (change: Partial<PasswordOptions>) => updateSettings({ passwordOptions: { ...passwordOptions, ...change } });
  const setPassphrase = (change: Partial<PassphraseOptions>) =>
    updateSettings({ passphraseOptions: { ...passphraseOptions, ...change } });

  // At least one kind of character must stay on, so its checkbox can't be turned off.
  const enabledSets = (["lowercase", "uppercase", "digits", "symbols"] as const).filter((s) => passwordOptions[s]);
  const isLastSet = (set: (typeof enabledSets)[number]) => enabledSets.length === 1 && passwordOptions[set];

  return (
    <div className="grid gap-4">
      <div className="flex rounded-md border border-border bg-sunken p-0.5" role="group" aria-label="Kind">
        {(["password", "passphrase"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => updateSettings({ generatorKind: k })}
            className={clsx(
              "flex-1 cursor-pointer rounded-sm py-1 text-[13px] capitalize",
              kind === k ? "bg-surface font-medium text-text shadow-sm" : "text-muted",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        <div className="flex min-h-14 items-center gap-2 rounded-md border border-border bg-sunken p-2.5">
          <output aria-live="polite" className="min-w-0 flex-1 font-mono text-[13px] break-all">
            {value || " "}
          </output>
          <IconButton label="Generate another" onClick={regenerate}>
            <RefreshCw size={16} />
          </IconButton>
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="tabular-nums">{Math.round(bits)} bits of entropy</span>
          <Badge tone={bits >= 80 ? "success" : bits >= 60 ? "warning" : "danger"}>
            {bits >= 80 ? "Strong" : bits >= 60 ? "Fair" : "Weak"}
          </Badge>
        </div>
      </div>

      {kind === "password" ? (
        <div className="grid gap-3">
          <Slider
            label="Length"
            value={passwordOptions.length}
            min={PASSWORD_LENGTH.min}
            max={64}
            onChange={(length) => setPassword({ length })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Check label="A–Z" checked={passwordOptions.uppercase} disabled={isLastSet("uppercase")} onChange={(uppercase) => setPassword({ uppercase })} />
            <Check label="a–z" checked={passwordOptions.lowercase} disabled={isLastSet("lowercase")} onChange={(lowercase) => setPassword({ lowercase })} />
            <Check label="0–9" checked={passwordOptions.digits} disabled={isLastSet("digits")} onChange={(digits) => setPassword({ digits })} />
            <Check label="!@#$%" checked={passwordOptions.symbols} disabled={isLastSet("symbols")} onChange={(symbols) => setPassword({ symbols })} />
          </div>
          <Check
            label="Avoid look-alikes (I l 1 O 0 o)"
            checked={passwordOptions.avoidAmbiguous}
            onChange={(avoidAmbiguous) => setPassword({ avoidAmbiguous })}
          />
        </div>
      ) : (
        <div className="grid gap-3">
          <Slider
            label="Words"
            value={passphraseOptions.words}
            min={PASSPHRASE_WORDS.min}
            max={PASSPHRASE_WORDS.max}
            onChange={(words) => setPassphrase({ words })}
          />
          <label className="flex items-center justify-between gap-2 text-[13px]">
            Separator
            <select
              value={passphraseOptions.separator}
              onChange={(e) => setPassphrase({ separator: e.target.value as PassphraseOptions["separator"] })}
              className="h-7 rounded-sm border border-border-strong bg-surface px-1.5 font-mono text-[13px]"
            >
              <option value="-">- hyphen</option>
              <option value=" ">␣ space</option>
              <option value=".">. period</option>
              <option value="_">_ underscore</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Check label="Capitalize" checked={passphraseOptions.capitalize} onChange={(capitalize) => setPassphrase({ capitalize })} />
            <Check label="Add a number" checked={passphraseOptions.includeNumber} onChange={(includeNumber) => setPassphrase({ includeNumber })} />
          </div>
        </div>
      )}

      <Button size="lg" disabled={!value} onClick={() => onUse(value)}>
        {action === "copy" ? `Copy ${kind}` : `Use this ${kind}`}
      </Button>
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-[13px]">
      <span className="flex justify-between">
        {label}
        <span className="font-mono tabular-nums">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-accent"
      />
    </label>
  );
}

function Check({ label, checked, disabled, onChange }: {
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={clsx("flex items-center gap-2 text-[13px]", disabled && "opacity-60")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  );
}
