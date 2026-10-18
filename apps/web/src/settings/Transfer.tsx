import { DecryptionError } from "@pass1/crypto";
import { useState, type FormEvent } from "react";
import { StrengthMeter } from "../components/StrengthMeter";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/ui/TextField";
import { MIN_MASTER_PASSWORD_SCORE, usePasswordStrength } from "../lib/password-strength";
import { exportVault, importVault, InvalidExportFileError } from "../lib/vault-transfer";
import { errorMessage } from "../session/session";
import { Outcome, Panel, Section } from "./layout";

type Outcome = { tone: "success" | "danger"; text: string } | null;

export function Transfer({ vaultKey }: { vaultKey: CryptoKey }) {
  return (
    <Section title="Export and import" note="Files are encrypted with a password you choose">
      <ExportForm vaultKey={vaultKey} />
      <ImportForm vaultKey={vaultKey} />
    </Section>
  );
}

function ExportForm({ vaultKey }: { vaultKey: CryptoKey }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const strength = usePasswordStrength(password);
  const canSubmit = strength !== null && strength.score >= MIN_MASTER_PASSWORD_SCORE && !busy;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setOutcome(null);
    try {
      const count = await exportVault(vaultKey, password);
      setPassword("");
      setOutcome({ tone: "success", text: `Exported ${count} item${count === 1 ? "" : "s"}. Keep the password with it: the file can't be opened without it.` });
    } catch (err) {
      setOutcome({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-0.5">
          <h3 className="text-[13px] font-medium">Export</h3>
          <p className="text-xs text-muted">All items except the trash, in one encrypted file. It still opens if you change your master password.</p>
        </div>
        <PasswordField
          label="Password for this file"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={password && <StrengthMeter strength={strength} />}
        />
        {outcome && <Outcome tone={outcome.tone}>{outcome.text}</Outcome>}
        <Button type="submit" variant="secondary" disabled={!canSubmit} className="justify-self-end">
          {busy ? "Encrypting…" : "Download export"}
        </Button>
      </form>
    </Panel>
  );
}

function ImportForm({ vaultKey }: { vaultKey: CryptoKey }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const busy = progress !== null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file || !password || busy) return;
    setOutcome(null);
    setProgress("Decrypting…");
    try {
      const result = await importVault(vaultKey, await file.text(), password, (done, total) =>
        setProgress(`Importing ${done} of ${total}…`),
      );
      setPassword("");
      setOutcome(
        result.stoppedBecause
          ? { tone: "danger", text: `Imported ${result.imported} of ${result.total}. ${result.stoppedBecause}` }
          : { tone: "success", text: `Imported ${result.imported} item${result.imported === 1 ? "" : "s"}. Open the vault to see them.` },
      );
    } catch (err) {
      const text =
        err instanceof DecryptionError
          ? "Wrong password for this file, or the file was changed."
          : err instanceof InvalidExportFileError
            ? err.message
            : errorMessage(err);
      setOutcome({ tone: "danger", text });
    } finally {
      setProgress(null);
    }
  }

  return (
    <Panel>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <div className="grid gap-0.5">
          <h3 className="text-[13px] font-medium">Import</h3>
          <p className="text-xs text-muted">Adds the items from a pass1 export. Nothing in your vault is replaced.</p>
        </div>
        <label className="grid gap-1.5 text-[13px] font-medium">
          Export file
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[13px] font-normal text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-text"
          />
        </label>
        <PasswordField
          label="Password for this file"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {outcome && <Outcome tone={outcome.tone}>{outcome.text}</Outcome>}
        <div className="flex items-center justify-end gap-3">
          {progress && <span className="text-xs text-muted tabular-nums">{progress}</span>}
          <Button type="submit" variant="secondary" disabled={!file || !password || busy}>
            Import
          </Button>
        </div>
      </form>
    </Panel>
  );
}
