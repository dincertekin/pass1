import { useState, type FormEvent } from "react";
import { AuthLayout } from "../components/AuthLayout";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/ui/TextField";
import { errorMessage, useSession } from "../session/session";
import { SlowOnPurpose } from "./LoginScreen";

export function UnlockScreen({ email }: { email: string }) {
  const { unlock, logOut } = useSession();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
    } catch (err) {
      setError(errorMessage(err));
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Unlock your vault"
      subtitle={email}
      footer={
        <>
          Not you?{" "}
          <button type="button" onClick={logOut} className="cursor-pointer font-medium text-accent hover:underline">
            Log out
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && <Alert>{error}</Alert>}
        {/* Hidden username so password managers know which account this is for. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <PasswordField
          label="Master password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Unlocking vault…" : "Unlock"}
        </Button>
        {busy && <SlowOnPurpose />}
      </form>
    </AuthLayout>
  );
}
