import { clsx } from "clsx";
import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";

const sizes = {
  sm: "md:max-w-sm",
  md: "md:max-w-md",
  /** Wide, as tall as its content (the plans). */
  lg: "md:max-w-220",
  /** Wide with a fixed height, so switching tabs doesn't make it jump (Settings). */
  xl: "md:max-w-220 md:h-155",
};

/**
 * A modal dialog. Radix handles focus trapping, Escape, scroll locking and screen reader
 * announcements; this file only styles it. On phones every dialog fills the screen.
 */
export function Dialog({ open, onOpenChange, title, description, size = "md", hideHeader, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  size?: keyof typeof sizes;
  /** For layouts that draw their own header (the Settings dialog). The title still reaches screen readers. */
  hideHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade-in fixed inset-0 z-40 bg-scrim" />
        <RadixDialog.Content
          className={clsx(
            "animate-pop-in fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface outline-none",
            "md:inset-auto md:top-1/2 md:left-1/2 md:w-[calc(100%-32px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:shadow-dialog",
            sizes[size],
          )}
        >
          {hideHeader ? (
            <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
          ) : (
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-1">
              <div className="grid gap-1">
                <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
                {description && <RadixDialog.Description className="text-[13px] text-muted">{description}</RadixDialog.Description>}
              </div>
              <RadixDialog.Close asChild>
                <IconButton label="Close">
                  <X size={16} />
                </IconButton>
              </RadixDialog.Close>
            </div>
          )}
          {/* Radix warns when a dialog has no description; an empty one is fine for screen readers. */}
          {!description && <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
