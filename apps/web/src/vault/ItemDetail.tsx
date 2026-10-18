import { ArrowLeft, ExternalLink, Eye, EyeOff, Star } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { errorMessage } from "../session/session";
import { CopyButton } from "./CopyButton";
import { displayName, safeHref } from "./entries";
import { ItemAvatar } from "./ItemAvatar";
import { useVault, type VaultEntry } from "./vault-store";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Shows one item. Render with key={entry.id} so the password hides again when the item changes. */
export function ItemDetail({ entry, onEdit, onBack, headingRef }: {
  entry: VaultEntry;
  onEdit: () => void;
  onBack: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const vault = useVault();
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { item } = entry;
  const inTrash = entry.deletedAt !== null;
  const href = safeHref(item?.url);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <article className="grid min-w-0 content-start gap-5 overflow-y-auto p-5">
      <Button variant="ghost" size="sm" onClick={onBack} className="justify-self-start md:hidden">
        <ArrowLeft size={14} /> Back
      </Button>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <ItemAvatar entry={entry} size="lg" />
          <div className="min-w-0">
            <h2 ref={headingRef} tabIndex={-1} className="truncate text-lg font-semibold outline-none">
              {displayName(entry)}
            </h2>
            <p className="truncate text-[13px] text-muted">{inTrash ? "In trash" : href ? new URL(href).hostname : "No website"}</p>
          </div>
        </div>
        {item && !inTrash && (
          <div className="flex items-center gap-1.5">
            <IconButton
              label={item.favorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={item.favorite === true}
              onClick={() => run(() => vault.update(entry, { ...item, favorite: !item.favorite }))}
            >
              <Star size={16} className={item.favorite ? "fill-accent text-accent" : undefined} />
            </IconButton>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
          </div>
        )}
      </header>

      {error && <Alert>{error}</Alert>}

      {item ? (
        <dl className="rounded-md border border-border">
          {item.username && (
            <Field label="Username" actions={<CopyButton value={item.username} label="Copy username" />}>
              {item.username}
            </Field>
          )}
          <Field
            label="Password"
            mono
            actions={
              <>
                <IconButton label={revealed ? "Hide password" : "Show password"} onClick={() => setRevealed((r) => !r)}>
                  {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                </IconButton>
                <CopyButton value={item.password} label="Copy password" />
              </>
            }
          >
            {revealed ? item.password : "•".repeat(14)}
          </Field>
          {item.url && (
            <Field
              label="Website"
              actions={
                href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open website"
                    title="Open website"
                    className="grid size-7 place-items-center rounded-sm text-muted hover:bg-sunken hover:text-text"
                  >
                    <ExternalLink size={16} />
                  </a>
                )
              }
            >
              {item.url}
            </Field>
          )}
        </dl>
      ) : (
        <Alert>
          This item couldn't be decrypted. It was corrupted or changed by someone without your key. You can delete it.
        </Alert>
      )}

      {item?.notes && (
        <section className="grid gap-1">
          <h3 className="text-[11px] font-semibold tracking-wide text-muted uppercase">Notes</h3>
          <p className="text-[13px] whitespace-pre-wrap">{item.notes}</p>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted">Updated {dateFormat.format(entry.updatedAt)}</p>
        {inTrash ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => run(() => vault.restore(entry))}>
              Restore
            </Button>
            <ConfirmDialog
              trigger={<Button variant="danger" size="sm">Delete forever</Button>}
              title={`Delete "${displayName(entry)}" forever?`}
              description="It will be removed from pass1 on every device. This can't be undone."
              confirmLabel="Delete forever"
              onConfirm={() => run(() => vault.remove(entry))}
            />
          </div>
        ) : (
          <Button variant="danger" size="sm" onClick={() => run(() => vault.trash(entry))}>
            Move to Trash
          </Button>
        )}
      </div>
    </article>
  );
}

function Field({ label, mono, actions, children }: { label: string; mono?: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-border py-2 pr-2 pl-3 not-first:border-t">
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
        <dd className={mono ? "font-mono text-[13px] break-all" : "break-words"}>{children}</dd>
      </div>
      <div className="flex gap-0.5">{actions}</div>
    </div>
  );
}
