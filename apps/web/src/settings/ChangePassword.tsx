import { useState, type FormEvent } from "react";
import { StrengthMeter } from "../components/StrengthMeter";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/ui/TextField";
import { MIN_MASTER_PASSWORD_SCORE, usePasswordStrength } from "../lib/password-strength";
import { errorMessage, useSession } from "../session/session";
import { Outcome, Panel, Section } from "./layout";

export function ChangePassword({ email }: { email: string }) {
  const { changeMasterPassword } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const strength = usePasswordStrength(next, [email, ...email.split("@"), current]);
  const strongEnough = strength !== null && strength.score >= MIN_MASTER_PASSWORD_SCORE;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && strongEnough && confirm === next && next !== current && !busy;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setOutcome(null);
    try {
      await changeMasterPassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setOutcome({ tone: "success", text: "Master password changed. Your other devices were logged out." });
    } catch (err) {
      setOutcome({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Master password">
      <Panel>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Lets password managers know which account this form is for. */}
          <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
          <PasswordField
            label="Current master password"
            autoComplete="current-password"
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
          {outcome && <Outcome tone={outcome.tone}>{outcome.text}</Outcome>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">Your items aren't re-encrypted, so this is quick at any vault size.</p>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? "Changing…" : "Change master password"}
            </Button>
          </div>
        </form>
      </Panel>
    </Section>
  );
}
