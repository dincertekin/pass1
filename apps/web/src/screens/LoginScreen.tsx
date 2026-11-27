import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PasswordField, TextField } from "../components/ui/TextField";
import { errorMessage, useSession } from "../session/session";
import { t } from "../lib/i18n";

export function LoginScreen() {
  const { logIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await logIn(email, password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <>
          {t("login.newHere")}{" "}
          <Link to="/register" className="font-medium text-accent hover:underline">
            {t("login.createAccount")}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && <Alert>{error}</Alert>}
        <TextField
          label={t("common.email")}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          label={t("common.masterPassword")}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t("common.unlockingVault") : t("common.logIn")}
        </Button>
        {busy && <SlowOnPurpose />}
      </form>
    </AuthLayout>
  );
}

/** Shown while Argon2 runs, so the wait reads as protection and not as lag. */
export function SlowOnPurpose() {
  return (
    <p className="text-center text-xs text-muted">{t("common.slowOnPurpose")}</p>
  );
}
