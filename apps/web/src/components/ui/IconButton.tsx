import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

/** A square icon-only button. `label` is required: it's what screen readers announce. */
export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm text-muted transition-colors hover:bg-sunken hover:text-text",
        className,
      )}
      {...props}
    />
  );
}
