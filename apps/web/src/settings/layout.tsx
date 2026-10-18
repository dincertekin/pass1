import type { ReactNode } from "react";

// Building blocks shared by the Settings sections.

export function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
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

export function Row({ label, hint, children }: { label: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-[13px] font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** For sections that hold a form instead of label/value rows. */
export function Panel({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 px-4 py-4">{children}</div>;
}

export function Select<T extends number>({ label, value, options, onChange }: {
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

/** A green or red message under a form, announced by screen readers. */
export function Outcome({ tone, children }: { tone: "success" | "danger"; children: ReactNode }) {
  return (
    <p role="status" className={tone === "success" ? "text-[13px] text-success" : "text-[13px] text-danger"}>
      {children}
    </p>
  );
}
