import type { BillingStatusResponse, CheckoutRequest } from "@pass1/shared";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "./api";

// The signed-in user's subscription, loaded once and shared by everything that shows it.
// Paying always happens on Paddle's pages: these functions send the whole browser there,
// so Paddle's code never runs on the page that holds the decrypted vault.

/** Set before going to checkout, read after coming back, to say thanks or "confirming…". */
export const UPGRADE_PENDING_KEY = "pass1.upgrade-pending";

let current: { userId: string; status: BillingStatusResponse } | null = null;
const listeners = new Set<() => void>();

function set(next: typeof current) {
  current = next;
  listeners.forEach((listener) => listener());
}

export async function loadBilling(userId: string) {
  set({ userId, status: await api.billing() });
}

/** Billing status for `userId`, or null while loading. Another user's cached status is never shown. */
export function useBilling(userId: string): BillingStatusResponse | null {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
  useEffect(() => {
    if (current?.userId !== userId) void loadBilling(userId).catch(() => {});
  }, [userId]);
  return snapshot?.userId === userId ? snapshot.status : null;
}

export async function startCheckout(choice: CheckoutRequest) {
  const { url } = await api.checkout(choice);
  try {
    sessionStorage.setItem(UPGRADE_PENDING_KEY, choice.plan);
  } catch {
    // Without storage the app just won't say thanks on the way back.
  }
  window.location.assign(url);
}

export async function openBillingPortal() {
  const { url } = await api.billingPortal();
  window.location.assign(url);
}
