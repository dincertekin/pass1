import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PasswordField, TextField } from "../components/ui/TextField";
import { errorMessage, useSession } from "../session/session";

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
      title="Log in to pass1"
      subtitle="Your vault is decrypted on this device."
      footer={
        <>
          New to pass1?{" "}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Create an account
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Unlocking vault…" : "Log in"}
        </Button>
        {busy && <SlowOnPurpose />}
      </form>
    </AuthLayout>
  );
}

/** Shown while Argon2 runs, so the wait reads as protection and not as lag. */
export function SlowOnPurpose() {
  return (
    <p className="text-center text-xs text-muted">
      Deriving your key with Argon2id. This takes a moment on purpose: it makes guessing your password slow.
    </p>
  );
}
