import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * Asks before something that can't be undone. Radix handles focus trapping, Escape to cancel
 * and screen reader announcements; this file only styles it.
 */
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm }: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-3 rounded-lg border border-border bg-surface p-5 shadow-pop">
          <AlertDialog.Title className="text-base font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="text-[13px] text-muted">{description}</AlertDialog.Description>
          <div className="mt-2 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
