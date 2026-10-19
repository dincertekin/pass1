import { clsx } from "clsx";

/** An on/off switch. `label` is what screen readers announce. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "flex h-5 w-9 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors",
        checked ? "justify-end bg-accent" : "justify-start bg-border-strong",
      )}
    >
      <span className="size-4 rounded-full bg-surface shadow-sm" />
    </button>
  );
}
