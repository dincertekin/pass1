import { AlertDialog } from "radix-ui";
import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/ui/TextField";
import { errorMessage, useSession } from "../session/session";
import { Outcome, Row, Section } from "./layout";

export function DeleteAccount({ email }: { email: string }) {
  const { deleteAccount } = useSession();
  const [open, setOpen] = useState(false);
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
    <Section title="Danger zone">
      <Row label="Delete account" hint="Your vault is deleted from pass1 for good. Export it first if you want a copy.">
        <AlertDialog.Root
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            setPassword("");
            setError(null);
          }}
        >
          <AlertDialog.Trigger asChild>
            <Button variant="danger" size="sm">
              Delete account
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
            <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-pop">
              <form onSubmit={handleSubmit} className="grid gap-3">
                <AlertDialog.Title className="text-base font-semibold">Delete your pass1 account?</AlertDialog.Title>
                <AlertDialog.Description className="text-[13px] text-muted">
                  This deletes {email} and every item in the vault, on every device. It can't be undone, and pass1
                  can't recover it.
                </AlertDialog.Description>
                <PasswordField
                  label="Master password"
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {error && <Outcome tone="danger">{error}</Outcome>}
                <div className="mt-2 flex justify-end gap-2">
                  <AlertDialog.Cancel asChild>
                    <Button variant="secondary">Cancel</Button>
                  </AlertDialog.Cancel>
                  {/* A plain submit button, not AlertDialog.Action, so a wrong password keeps the dialog open. */}
                  <Button type="submit" variant="danger" disabled={!password || busy}>
                    {busy ? "Deleting…" : "Delete account"}
                  </Button>
                </div>
              </form>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </Row>
    </Section>
  );
}
