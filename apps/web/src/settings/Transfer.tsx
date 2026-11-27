import { DecryptionError, type VaultItem } from "@pass1/crypto";
import { useState, type FormEvent } from "react";
import { StrengthMeter } from "../components/StrengthMeter";
import { Button } from "../components/ui/Button";
import { PasswordField } from "../components/ui/TextField";
import { itemsFromFile } from "@pass1/core";
import { MIN_MASTER_PASSWORD_SCORE, usePasswordStrength } from "../lib/password-strength";
import { addItems, exportVault, InvalidExportFileError, itemsFromPass1Export } from "../lib/vault-transfer";
import { errorMessage } from "../session/session";
import { tileStyle } from "../vault/tiles";
import { useVault } from "../vault/vault-store";
import { FormActions, FormIntro, Outcome, SettingRow } from "./layout";
import { t, tx } from "../lib/i18n";

export type ImportSource = "browser" | "bitwarden" | "1password" | "pass1";

export const IMPORT_SOURCES: { id: ImportSource; name: string; format: string; accept: string; initial: string }[] = [
  { id: "browser", name: t("transfer.browsers"), format: t("transfer.formatBrowsers"), accept: ".csv,text/csv", initial: "C" },
  { id: "bitwarden", name: "Bitwarden", format: t("transfer.formatBitwarden"), accept: ".json,.csv,application/json,text/csv", initial: "B" },
  { id: "1password", name: "1Password", format: t("transfer.format1Password"), accept: ".csv,text/csv", initial: "1" },
  { id: "pass1", name: t("transfer.pass1Export"), format: t("transfer.formatPass1"), accept: ".json,application/json", initial: "p" },
];

/** The Import & export tab: one card per source, plus Export. */
export function TransferTab({ onImport, onExport }: { onImport: (source: ImportSource) => void; onExport: () => void }) {
  return (
    <div className="grid gap-4">
      <FormIntro>{t("transfer.intro")}</FormIntro>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {IMPORT_SOURCES.map((source) => (
          <button
            key={source.id}
            type="button"
            onClick={() => onImport(source.id)}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left hover:border-border-strong hover:shadow-pop"
          >
            <span aria-hidden="true" className="grid size-8.5 shrink-0 place-items-center rounded-lg text-sm font-semibold" style={tileStyle(source.name, true)}>
              {source.initial}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{source.name}</span>
              <span className="block text-xs text-muted">{source.format}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="border-t border-border">
        <SettingRow label={t("transfer.export")} hint={t("transfer.exportHint")}>
          <Button variant="secondary" onClick={onExport}>
            {t("transfer.exportButton")}
          </Button>
        </SettingRow>
      </div>
    </div>
  );
}

/** Shown inside Settings, in place of the Import & export tab. Read the file, show what's in it, then save. */
export function ImportForm({ source, vaultKey, onClose }: { source: ImportSource; vaultKey: CryptoKey; onClose: () => void }) {
  const info = IMPORT_SOURCES.find((s) => s.id === source)!;
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [found, setFound] = useState<VaultItem[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vault = useVault();
  const encrypted = source === "pass1";

  // Step 1: read the file here and show what's in it, before anything is saved.
  async function read(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      setFound(encrypted ? await itemsFromPass1Export(text, password) : itemsFromFile(file.name, text));
    } catch (err) {
      setError(
        err instanceof DecryptionError
          ? t("import.wrongPassword")
          : err instanceof InvalidExportFileError
            ? err.message
            : errorMessage(err),
      );
    }
  }

  // Step 2: encrypt and save each item.
  async function save() {
    if (!found) return;
    setProgress(t("transfer.encrypting"));
    try {
      const outcome = await addItems(vaultKey, found, (done, total) => setProgress(t("transfer.importing", { done, total })));
      // The items were saved directly, so load the vault again to show them.
      await vault.reload();
      const reminder = encrypted ? "" : ` ${t("transfer.deleteSourceReminder")}`;
      setResult(
        outcome.stoppedBecause
          ? { tone: "danger", text: t("transfer.importedSome", { imported: outcome.imported, total: outcome.total, reason: outcome.stoppedBecause }) }
          : { tone: "success", text: t("transfer.imported", { count: outcome.imported }) + reminder },
      );
    } catch (err) {
      setResult({ tone: "danger", text: errorMessage(err) });
    } finally {
      setProgress(null);
    }
  }

  if (result) {
    return (
      <div className="grid gap-4">
        <Outcome tone={result.tone}>{result.text}</Outcome>
        <FormActions>
          <Button onClick={onClose}>{t("common.done")}</Button>
        </FormActions>
      </div>
    );
  }

  if (found) {
    return (
      <div className="grid gap-4 text-[13px]">
        <p>{tx("transfer.found", { count: <strong>{found.length}</strong>, file: file?.name ?? "" })}</p>
        {progress && <p className="text-muted tabular-nums">{progress}</p>}
        <FormActions>
          <Button variant="secondary" onClick={() => setFound(null)} disabled={!!progress}>
            {t("common.back")}
          </Button>
          <Button onClick={() => void save()} disabled={!!progress}>
            {t("transfer.importButton", { count: found.length })}
          </Button>
        </FormActions>
      </div>
    );
  }

  return (
    <form onSubmit={read} className="grid max-w-md gap-4">
      <label className="grid gap-1.5 text-[13px] font-medium">
        {encrypted ? t("transfer.exportFile") : t("transfer.sourceFile", { format: info.format })}
        <input
          type="file"
          accept={info.accept}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-[13px] font-normal text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-text"
        />
      </label>
      {encrypted && <PasswordField label={t("transfer.filePassword")} autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />}
      {error && <Outcome tone="danger">{error}</Outcome>}
      <FormActions>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!file || (encrypted && !password)}>
          {t("signup.continue")}
        </Button>
      </FormActions>
    </form>
  );
}

/** Shown inside Settings, in place of the Import & export tab. */
export function ExportForm({ vaultKey, onDone }: { vaultKey: CryptoKey; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
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
      setOutcome({ tone: "success", text: t("transfer.exported", { count }) });
    } catch (err) {
      setOutcome({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid max-w-md gap-4">
      <FormIntro>{t("transfer.exportIntro")}</FormIntro>
      <PasswordField
        label={t("transfer.filePassword")}
        autoComplete="new-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={password && <StrengthMeter strength={strength} />}
      />
      {outcome && <Outcome tone={outcome.tone}>{outcome.text}</Outcome>}
      <FormActions>
        <Button variant="secondary" onClick={onDone}>
          {outcome?.tone === "success" ? t("common.done") : t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {busy ? t("transfer.encrypting") : t("transfer.download")}
        </Button>
      </FormActions>
    </form>
  );
}
