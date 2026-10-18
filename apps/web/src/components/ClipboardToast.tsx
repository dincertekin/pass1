import { Toast } from "radix-ui";
import { clearNow, dismissCleared, useClipboardState } from "../lib/clipboard";

/**
 * "Password copied · clears in 23s". Radix announces it to screen readers.
 * Rendered once, outside the vault, so "Clipboard cleared" still shows after locking.
 */
export function ClipboardToast() {
  const state = useClipboardState();

  const message =
    state.status === "counting"
      ? `${state.label} copied · clears in ${state.secondsLeft}s`
      : state.status === "waitingForFocus"
        ? `${state.label} is still in the clipboard. It clears when you return to pass1.`
        : "Clipboard cleared";

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
          <Toast.Action altText="Clear the clipboard now" asChild>
            <button type="button" onClick={() => void clearNow()} className="cursor-pointer font-medium underline-offset-2 hover:underline">
              Clear now
            </button>
          </Toast.Action>
        )}
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 outline-none" />
    </Toast.Provider>
  );
}
