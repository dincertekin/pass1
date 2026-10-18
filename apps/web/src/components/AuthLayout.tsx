import type { ReactNode } from "react";
import { Logo } from "./Logo";

/** The centered card used by the login, register and unlock screens. */
export function AuthLayout({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-sunken px-4 py-10">
      <div className="grid w-full max-w-sm gap-4">
        <div className="grid gap-5 rounded-lg border border-border bg-surface p-6 shadow-pop">
          <Logo />
          <div className="grid gap-0.5">
            <h1 className="text-lg font-semibold text-balance">{title}</h1>
            {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <p className="text-center text-[13px] text-muted">{footer}</p>}
      </div>
    </main>
  );
}
