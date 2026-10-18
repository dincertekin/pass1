import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { StrengthMeter } from "../components/StrengthMeter";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PasswordField, TextField } from "../components/ui/TextField";
import { MIN_MASTER_PASSWORD_SCORE, usePasswordStrength } from "../lib/password-strength";
import { errorMessage, useSession } from "../session/session";
import { SlowOnPurpose } from "./LoginScreen";

export function RegisterScreen() {
  const { register } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = usePasswordStrength(password, [email, ...email.split("@")]);
  const strongEnough = strength !== null && strength.score >= MIN_MASTER_PASSWORD_SCORE;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = strongEnough && confirm === password && understood && !busy;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await register(email, password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your vault"
      subtitle="Everything is encrypted on this device before it's saved."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && <Alert>{error}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label="Master password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            <>
              <StrengthMeter strength={strength} />
              {strength && !strongEnough && (
                <p className="text-xs text-muted">Needs to be at least "Good". A few random words work well.</p>
              )}
            </>
          }
        />
        <PasswordField
          label="Confirm master password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          hint={mismatch && <p className="text-xs text-danger">Passwords don't match.</p>}
        />

        <Alert tone="warning">
          <p>
            <strong className="text-warning">There is no password reset.</strong> pass1 never sees your master
            password, so nobody can recover your vault if you forget it.
          </p>
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            I understand that a lost master password means a lost vault.
          </label>
        </Alert>

        <Button type="submit" size="lg" disabled={!canSubmit}>
          {busy ? "Creating vault…" : "Create account"}
        </Button>
        {busy && <SlowOnPurpose />}
      </form>
    </AuthLayout>
  );
}
