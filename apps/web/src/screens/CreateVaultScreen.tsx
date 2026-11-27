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
import { t, tx } from "../lib/i18n";

/**
 * Step 2 of creating an account, opened from the emailed link: choose the master password.
 * `email` comes from the link (checked with the server), so it can't be changed here.
 */
export function CreateVaultScreen({ signupToken, email }: { signupToken: string; email: string }) {
  const { register } = useSession();
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
      await register(signupToken, password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t("signup.title")}
      subtitle={t("createVault.subtitle")}
      footer={
        <>
          {t("signup.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            {t("common.logIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && <Alert>{error}</Alert>}
        <TextField
          label={t("common.email")}
          type="email"
          // Lets the browser save the new password together with this email.
          autoComplete="username"
          readOnly
          value={email}
        />
        <PasswordField
          label={t("common.masterPassword")}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            <>
              <StrengthMeter strength={strength} />
              {strength && !strongEnough && (
                <p className="text-xs text-muted">{t("createVault.needsGood")}</p>
              )}
            </>
          }
        />
        <PasswordField
          label={t("createVault.confirm")}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          hint={mismatch && <p className="text-xs text-danger">{t("createVault.mismatch")}</p>}
        />

        <Alert tone="warning">
          <p>{tx("createVault.noResetWarning", { noReset: <strong className="text-warning">{t("createVault.noReset")}</strong> })}</p>
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            {t("createVault.understand")}
          </label>
        </Alert>

        <Button type="submit" size="lg" disabled={!canSubmit}>
          {busy ? t("createVault.creating") : t("createVault.submit")}
        </Button>
        {busy && <SlowOnPurpose />}
      </form>
    </AuthLayout>
  );
}
