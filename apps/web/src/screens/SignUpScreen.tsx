import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { api } from "../lib/api";
import { solveSignUpPuzzle } from "../lib/proof-of-work";
import { errorMessage } from "../session/session";
import { t, tx } from "../lib/i18n";

// Step 1 of creating an account: only the email. The server always answers the same way,
// so this page says "check your inbox" whether or not the email already has an account.

const LOGIN_FOOTER = (
  <>
    {t("signup.haveAccount")}{" "}
    <Link to="/login" className="font-medium text-accent hover:underline">
      {t("common.logIn")}
    </Link>
  </>
);

export function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.signup({ email, proofOfWork: await solveSignUpPuzzle() });
      setSentTo(email.trim());
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  if (sentTo) {
    return (
      <AuthLayout title={t("signup.checkInbox")} footer={LOGIN_FOOTER}>
        <div className="grid gap-4 text-[13px]">
          <p>{tx("signup.sent", { email: <strong>{sentTo}</strong> })}</p>
          <p className="text-muted">{t("signup.nothingThere")}</p>
          <Button variant="secondary" onClick={() => setSentTo(null)}>
            {t("signup.sendAgain")}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("signup.title")} subtitle={t("signup.subtitle")} footer={LOGIN_FOOTER}>
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && <Alert>{error}</Alert>}
        <TextField label={t("common.email")} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" size="lg" disabled={busy || email.trim() === ""}>
          {busy ? t("signup.sending") : t("signup.continue")}
        </Button>
      </form>
    </AuthLayout>
  );
}
