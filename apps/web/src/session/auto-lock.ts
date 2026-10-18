import { useEffect, useState } from "react";
import { getSettings } from "../lib/settings";

// Locks the vault after a period without activity (15 minutes by default, see Settings).
//
// Browsers slow down timers in background tabs, and a sleeping laptop runs none at all.
// So instead of one long timer, this checks the clock every few seconds and again the moment
// the tab becomes visible: if the deadline has passed while asleep, it locks right away.

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
const CHECK_EVERY_MS = 5000;

let lastActivityAt = Date.now();

function markActive() {
  lastActivityAt = Date.now();
}

function msUntilLock() {
  return lastActivityAt + getSettings().autoLockMinutes * 60_000 - Date.now();
}

/** Call once while the vault is unlocked. */
export function useAutoLock(lock: () => void) {
  useEffect(() => {
    markActive();
    const check = () => {
      if (msUntilLock() <= 0) lock();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(check, CHECK_EVERY_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [lock]);
}

/** "14:52": time left before auto-lock, updated every second. Only the component using it re-renders. */
export function useLockCountdown(): string {
  const [ms, setMs] = useState(msUntilLock);
  useEffect(() => {
    const interval = setInterval(() => setMs(msUntilLock()), 1000);
    return () => clearInterval(interval);
  }, []);
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
