import { useState, type FormEvent } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/ui/TextField";
import { errorMessage, useSession } from "../session/session";
import { FormActions, Outcome } from "./layout";
import { t, tx } from "../lib/i18n";

/** Shown inside Settings, in place of the Account tab, so no second window opens. */
export function DeleteAccountForm({ email, onCancel }: { email: string; onCancel: () => void }) {
  const { deleteAccount } = useSession();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // On success the session ends and the app shows the login screen.
      await deleteAccount(password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-md gap-4">
      <Alert>
        {tx("deleteAccount.warning", { email: <strong>{email}</strong> })}
      </Alert>
      <PasswordField
        label={t("common.masterPassword")}
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <Outcome tone="danger">{error}</Outcome>}
      <FormActions>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="danger" disabled={!password || busy}>
          {busy ? t("deleteAccount.deleting") : t("settings.deleteAccount")}
        </Button>
      </FormActions>
    </form>
  );
}
