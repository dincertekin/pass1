import {
  createVaultKey,
  DecryptionError,
  DEFAULT_KDF_PARAMS,
  generateSalt,
  unwrapVaultKey,
} from "@pass1/crypto";
import type { AccountResponse } from "@pass1/shared";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiRequestError } from "../lib/api";
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
}

const SessionContext = createContext<(SessionActions & { session: Session }) | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });

  // On page load: is there still a valid session cookie?
  useEffect(() => {
    api.me().then(
      (account) => setSession({ status: "locked", account }),
      () => setSession({ status: "loggedOut" }),
    );
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

    lock() {
      if (session.status === "unlocked") setSession({ status: "locked", account: session.account });
    },

    async logOut() {
      // Forget everything locally even if the server can't be reached.
      setSession({ status: "loggedOut" });
      await api.logout().catch(() => {});
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
