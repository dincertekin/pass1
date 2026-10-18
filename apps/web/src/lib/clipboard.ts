import { useSyncExternalStore } from "react";
import { getSettings } from "./settings";

// Copies secrets and wipes them from the clipboard after a delay (30 seconds by default).
//
// Browsers only let a page write to the clipboard while the page has focus. If the user
// has switched to another app to paste, clearing fails, so it's retried the moment they
// come back to pass1. Locking the vault clears it right away.

export type ClipboardState =
  | { status: "idle" }
  | { status: "counting"; label: string; secondsLeft: number }
  | { status: "waitingForFocus"; label: string }
  | { status: "cleared" };

let state: ClipboardState = { status: "idle" };
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function setState(next: ClipboardState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Copies `value` and schedules clearing it. `label` is what the toast calls it ("Password"). */
export async function copySecret(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  stopTimer();
  window.removeEventListener("focus", clearOnFocus);

  let secondsLeft = getSettings().clipboardClearSeconds;
  setState({ status: "counting", label, secondsLeft });
  timer = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) setState({ status: "counting", label, secondsLeft });
    else void clearNow();
  }, 1000);
}

/** Clears the clipboard if pass1 put something there that hasn't been cleared yet. */
export async function clearNow() {
  if (state.status === "idle" || state.status === "cleared") return;
  stopTimer();
  try {
    await navigator.clipboard.writeText("");
    setState({ status: "cleared" });
  } catch {
    // Not focused. Try again as soon as the user returns.
    if (state.status === "counting") setState({ status: "waitingForFocus", label: state.label });
    window.addEventListener("focus", clearOnFocus, { once: true });
  }
}

/** Hides the toast. Doesn't cancel a pending clear. */
export function dismissCleared() {
  if (state.status === "cleared") setState({ status: "idle" });
}

function clearOnFocus() {
  void clearNow();
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function useClipboardState(): ClipboardState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
