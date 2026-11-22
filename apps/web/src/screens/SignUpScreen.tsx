import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { api } from "../lib/api";
import { solveSignUpPuzzle } from "../lib/proof-of-work";
import { errorMessage } from "../session/session";

// Step 1 of creating an account: only the email. The server always answers the same way,
// so this page says "check your inbox" whether or not the email already has an account.

const LOGIN_FOOTER = (
  <>
    Already have an account?{" "}
    <Link to="/login" className="font-medium text-accent hover:underline">
      Log in
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
      <AuthLayout title="Check your inbox" footer={LOGIN_FOOTER}>
        <div className="grid gap-4 text-[13px]">
          <p>
            We sent an email to <strong>{sentTo}</strong>. Open the link in it to choose your master password.
            The link works for one hour.
          </p>
          <p className="text-muted">Nothing there after a few minutes? Check your spam folder, or send it again.</p>
          <Button variant="secondary" onClick={() => setSentTo(null)}>
            Send it again
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your vault" subtitle="Start with your email. We'll send you a link to continue." footer={LOGIN_FOOTER}>
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && <Alert>{error}</Alert>}
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" size="lg" disabled={busy || email.trim() === ""}>
          {busy ? "Sending…" : "Continue"}
        </Button>
      </form>
    </AuthLayout>
  );
}
