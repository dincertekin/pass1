import {
  createVaultKey,
  DecryptionError,
  DEFAULT_KDF_PARAMS,
  generateSalt,
  rewrapVaultKey,
  unwrapVaultKey,
} from "@pass1/crypto";
import type { AccountResponse } from "@pass1/shared";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiRequestError, setSessionEndedHandler } from "../lib/api";
import { clearNow as clearClipboard } from "../lib/clipboard";
import { deriveKeysInWorker } from "../lib/derive-keys";

// Who is logged in, and whether the vault is open.
//
// The vault key lives only here, in memory. It's never written to localStorage or anywhere
// else, so reloading or closing the tab always locks the vault. The session cookie survives
// a reload, so after one the user only re-enters the master password (status "locked").

export type Session =
  | { status: "loading" }
  | { status: "loggedOut" }
  | { status: "locked"; account: AccountResponse }
  | { status: "unlocked"; account: AccountResponse; vaultKey: CryptoKey };

interface SessionActions {
  register(email: string, masterPassword: string): Promise<void>;
  logIn(email: string, masterPassword: string): Promise<void>;
  unlock(masterPassword: string): Promise<void>;
  lock(): void;
  logOut(): Promise<void>;
  changeMasterPassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Fetches the account again, e.g. to see a new plan after paying. Keeps the vault unlocked. */
  refreshAccount(): Promise<void>;
  deleteAccount(masterPassword: string): Promise<void>;
}

const SessionContext = createContext<(SessionActions & { session: Session }) | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });

  // If the server ends this session (from another device, or a password change elsewhere),
  // forget the keys here too.
  useEffect(() => {
    setSessionEndedHandler(() => {
      void clearClipboard();
      setSession({ status: "loggedOut" });
    });
  }, []);

  // On page load: is there still a valid session cookie?
  useEffect(() => {
    api.me().then(
      (account) => setSession({ status: "locked", account }),
      () => setSession({ status: "loggedOut" }),
    );
  }, []);

  // Dropping the vault key from state is what locks the vault: nothing else holds it.
  // Stable across renders, so auto-lock's timers don't restart on every render.
  const lock = useCallback(() => {
    void clearClipboard();
    setSession((current) => (current.status === "unlocked" ? { status: "locked", account: current.account } : current));
  }, []);

  const actions: SessionActions = {
    async register(email, masterPassword) {
      const kdfSalt = generateSalt();
      const { authKey, encryptionKey } = await deriveKeysInWorker(masterPassword, kdfSalt, DEFAULT_KDF_PARAMS);
      const { vaultKey, wrappedVaultKey } = await createVaultKey(encryptionKey);
      const account = await api.register({ email, authKey, kdfSalt, kdfParams: DEFAULT_KDF_PARAMS, wrappedVaultKey });
      setSession({ status: "unlocked", account, vaultKey });
    },

    async logIn(email, masterPassword) {
      const { kdfSalt, kdfParams } = await api.prelogin(email);
      const { authKey, encryptionKey } = await deriveKeysInWorker(masterPassword, kdfSalt, kdfParams);
      const account = await api.login(email, authKey);
      const vaultKey = await unwrapVaultKey(encryptionKey, account.wrappedVaultKey);
      setSession({ status: "unlocked", account, vaultKey });
    },

    // Unlocking never contacts the server: if the password is right, the vault key decrypts.
    async unlock(masterPassword) {
      if (session.status !== "locked") return;
      const { account } = session;
      const { encryptionKey } = await deriveKeysInWorker(masterPassword, account.kdfSalt, account.kdfParams);
      const vaultKey = await unwrapVaultKey(encryptionKey, account.wrappedVaultKey);
      setSession({ status: "unlocked", account, vaultKey });
    },

    lock,

    async logOut() {
      // Forget everything locally even if the server can't be reached.
      void clearClipboard();
      setSession({ status: "loggedOut" });
      await api.logout().catch(() => {});
    },

    // The vault key stays the same; only its encrypted copy on the server changes. A wrong
    // current password fails at rewrapVaultKey(), before anything is sent.
    async changeMasterPassword(currentPassword, newPassword) {
      if (session.status !== "unlocked") return;
      const { account, vaultKey } = session;

      const current = await deriveKeysInWorker(currentPassword, account.kdfSalt, account.kdfParams);
      const newKdfSalt = generateSalt();
      const next = await deriveKeysInWorker(newPassword, newKdfSalt, DEFAULT_KDF_PARAMS);
      const newWrappedVaultKey = await rewrapVaultKey(current.encryptionKey, account.wrappedVaultKey, next.encryptionKey);
      // Check the new copy opens before replacing the old one on the server.
      await unwrapVaultKey(next.encryptionKey, newWrappedVaultKey);

      const updated = await api.changePassword({
        currentAuthKey: current.authKey,
        newAuthKey: next.authKey,
        newKdfSalt,
        newKdfParams: DEFAULT_KDF_PARAMS,
        newWrappedVaultKey,
      });
      setSession({ status: "unlocked", account: updated, vaultKey });
    },

    async refreshAccount() {
      const account = await api.me();
      setSession((current) => (current.status === "unlocked" ? { ...current, account } : current));
    },

    async deleteAccount(masterPassword) {
      if (session.status !== "unlocked") return;
      const { authKey } = await deriveKeysInWorker(masterPassword, session.account.kdfSalt, session.account.kdfParams);
      await api.deleteAccount(authKey);
      void clearClipboard();
      setSession({ status: "loggedOut" });
    },
  };

  return <SessionContext.Provider value={{ session, ...actions }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

/** Turns any error from the actions above into a sentence for the user. */
export function errorMessage(err: unknown): string {
  if (err instanceof DecryptionError) return "Master password is incorrect.";
  if (err instanceof ApiRequestError) return err.message;
  return "Something went wrong. Try again.";
}
