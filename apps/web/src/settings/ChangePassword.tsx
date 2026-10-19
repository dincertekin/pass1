import { useState, type FormEvent } from "react";
import { StrengthMeter } from "../components/StrengthMeter";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/ui/TextField";
import { MIN_MASTER_PASSWORD_SCORE, usePasswordStrength } from "../lib/password-strength";
import { errorMessage, useSession } from "../session/session";
import { FormActions, FormIntro, Outcome } from "./layout";

/** Shown inside Settings, in place of the Security tab, so no second window opens. */
export function ChangePasswordForm({ email, onDone }: { email: string; onDone: () => void }) {
  const { changeMasterPassword } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = usePasswordStrength(next, [email, ...email.split("@"), current]);
  const strongEnough = strength !== null && strength.score >= MIN_MASTER_PASSWORD_SCORE;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && strongEnough && confirm === next && next !== current && !busy;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await changeMasterPassword(current, next);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <Outcome tone="success">Master password changed. Your other devices were logged out.</Outcome>
        <FormActions>
          <Button onClick={onDone}>Done</Button>
        </FormActions>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-md gap-4">
      <FormIntro>Your other devices will be logged out. Your items aren't re-encrypted, so this is quick at any vault size.</FormIntro>
      {/* Lets password managers know which account this form is for. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <PasswordField
        label="Current master password"
        autoComplete="current-password"
        autoFocus
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <PasswordField
        label="New master password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint={next && <StrengthMeter strength={strength} />}
      />
      <PasswordField
        label="Confirm new master password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        aria-invalid={mismatch}
        hint={mismatch && <p className="text-xs text-danger">Passwords don't match.</p>}
      />
      {error && <Outcome tone="danger">{error}</Outcome>}
      <FormActions>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {busy ? "Changing…" : "Change master password"}
        </Button>
      </FormActions>
    </form>
  );
}
