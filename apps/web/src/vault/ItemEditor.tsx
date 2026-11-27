import type { VaultItem } from "@pass1/crypto";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiRequestError } from "../lib/api";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { PasswordField, TextAreaField, TextField } from "../components/ui/TextField";
import { errorMessage } from "../session/session";
import { PasswordGenerator } from "./PasswordGenerator";
import type { VaultEntry } from "@pass1/core";
import { useVault } from "./vault-store";
import { t } from "../lib/i18n";

/** Creates a new item when `entry` is null, otherwise edits it. */
export function ItemEditor({ entry, onSaved, onCancel }: {
  entry: VaultEntry | null;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const vault = useVault();
  const existing = entry?.item;
  const [name, setName] = useState(existing?.name ?? "");
  const [username, setUsername] = useState(existing?.username ?? "");
  const [password, setPassword] = useState(existing?.password ?? "");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Empty optional fields are left out, so they don't take up space in the ciphertext.
    const item: VaultItem = {
      name: name.trim(),
      password,
      ...(username.trim() && { username: username.trim() }),
      ...(url.trim() && { url: url.trim() }),
      ...(notes.trim() && { notes }),
      ...(existing?.favorite && { favorite: true }),
    };

    try {
      if (entry) {
        await vault.update(entry, item);
        onSaved(entry.id);
      } else {
        onSaved(await vault.create(item));
      }
    } catch (err) {
      const conflict = err instanceof ApiRequestError && err.code === "CONFLICT";
      setError({ message: errorMessage(err), conflict });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-5 md:px-9 md:py-7">
      <div className="mx-auto grid w-full max-w-220 content-start gap-4">
        <Button variant="ghost" size="sm" onClick={onCancel} className="self-start md:hidden">
          <ArrowLeft size={14} /> {t("common.back")}
        </Button>
        <h2 className="text-lg font-semibold">{entry ? t("editor.editItem") : t("editor.newItem")}</h2>

        {error && (
          <Alert>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{error.message}</span>
              {/* Reloading throws away this edit, so it stays the user's choice. */}
              {error.conflict && (
                <Button variant="secondary" size="sm" onClick={() => void vault.reload().then(onCancel)}>
                  {t("editor.reload")}
                </Button>
              )}
            </div>
          </Alert>
        )}

        <TextField label={t("item.name")} required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("editor.namePlaceholder")} />
        <TextField
          label={t("item.username")}
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <PasswordField
          label={t("item.password")}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          actions={<PasswordGenerator onUse={setPassword} />}
        />
        <TextField
          label={t("item.website")}
          type="text"
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="github.com"
        />
        <TextAreaField label={t("item.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? t("editor.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
