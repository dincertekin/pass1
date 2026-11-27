import { Toast } from "radix-ui";
import { clearNow, dismissCleared, useClipboardState } from "../lib/clipboard";
import { t } from "../lib/i18n";

/**
 * "Password copied · clears in 23s". Radix announces it to screen readers.
 * Rendered once, outside the vault, so "Clipboard cleared" still shows after locking.
 */
export function ClipboardToast() {
  const state = useClipboardState();

  const message =
    state.status === "counting"
      ? t("clipboard.copied", { what: state.label, seconds: state.secondsLeft })
      : state.status === "waitingForFocus"
        ? t("clipboard.stillThere", { what: state.label })
        : t("clipboard.cleared");

  return (
    <Toast.Provider swipeDirection="down">
      <Toast.Root
        open={state.status !== "idle"}
        onOpenChange={(open) => !open && dismissCleared()}
        duration={state.status === "cleared" ? 2000 : Infinity}
        className="flex items-center gap-3 rounded-md bg-text px-3 py-2 text-[13px] text-bg shadow-pop"
      >
        <Toast.Description className="tabular-nums">{message}</Toast.Description>
        {state.status === "counting" && (
          <Toast.Action altText={t("clipboard.clearNowLabel")} asChild>
            <button type="button" onClick={() => void clearNow()} className="cursor-pointer font-medium underline-offset-2 hover:underline">
              {t("clipboard.clearNow")}
            </button>
          </Toast.Action>
        )}
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 outline-none" />
    </Toast.Provider>
  );
}
