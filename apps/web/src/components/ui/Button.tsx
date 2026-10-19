import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";

const variants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-text hover:bg-sunken",
  ghost: "text-muted hover:bg-sunken hover:text-text",
  danger: "border border-border-strong bg-surface text-danger hover:border-danger hover:bg-danger-soft",
};

const sizes = {
  sm: "h-6.5 px-2 text-xs",
  md: "h-8 px-3 text-[13px]",
  lg: "h-9 px-4 text-sm",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({ variant = "primary", size = "md", type = "button", className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
