import type { ReactNode } from "react";

// Building blocks shared by the Settings tabs and dialogs.

/** One setting: a label and explanation on the left, its control on the right. */
export function SettingRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border py-3.5 last:border-b-0">
      <div className="grid min-w-0 gap-0.5">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Select<T extends number | string>({ label, value, options, onChange }: {
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
      onChange={(e) => {
        const raw = e.target.value;
        onChange((typeof value === "number" ? Number(raw) : raw) as T);
      }}
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

/** A green or red message under a form, announced by screen readers. */
export function Outcome({ tone, children }: { tone: "success" | "danger"; children: ReactNode }) {
  return (
    <p role="status" className={tone === "success" ? "text-[13px] text-success" : "text-[13px] text-danger"}>
      {children}
    </p>
  );
}

/** The buttons under a form in Settings: cancel or back first, the main action last. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">{children}</div>;
}

/** Explanatory text at the top of a Settings form. */
export function FormIntro({ children }: { children: ReactNode }) {
  return <p className="max-w-[60ch] text-[13px] text-muted">{children}</p>;
}
