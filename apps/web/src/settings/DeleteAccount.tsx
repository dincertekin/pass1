import { useState, type FormEvent } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/ui/TextField";
import { errorMessage, useSession } from "../session/session";
import { FormActions, Outcome } from "./layout";

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
        This deletes <strong>{email}</strong> and every item in the vault, on every device. It can't be undone, and pass1 can't recover it.
      </Alert>
      <PasswordField
        label="Master password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <Outcome tone="danger">{error}</Outcome>}
      <FormActions>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={!password || busy}>
          {busy ? "Deleting…" : "Delete account"}
        </Button>
      </FormActions>
    </form>
  );
}
