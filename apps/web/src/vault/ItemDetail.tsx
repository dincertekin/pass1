import { AlertTriangle, ArrowLeft, ExternalLink, Eye, EyeOff, Star } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { errorMessage } from "../session/session";
import { CopyButton } from "./CopyButton";
import { displayName, safeHref } from "./entries";
import type { ItemHealth } from "./health";
import { HealthChip } from "./HealthChip";
import { ItemAvatar } from "./ItemAvatar";
import { useVault, type VaultEntry } from "./vault-store";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Shows one item. Render with key={entry.id} so the password hides again when the item changes. */
export function ItemDetail({ entry, health, onEdit, onBack, headingRef }: {
  entry: VaultEntry;
  health: ItemHealth | undefined;
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
    // The article fills the pane and scrolls; its content stays at a readable width, centered
    // on wide screens, so the copy buttons never end up far from their labels.
    <article className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-5 md:px-9 md:py-7">
      <div className="mx-auto flex w-full max-w-220 flex-1 flex-col gap-5">
        <Button variant="ghost" size="sm" onClick={onBack} className="self-start md:hidden">
          <ArrowLeft size={14} /> Back
        </Button>

        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <ItemAvatar entry={entry} size="lg" />
            <div className="min-w-0">
              <h2 ref={headingRef} tabIndex={-1} className="truncate text-[22px] font-semibold tracking-tight outline-none">
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

        {item && !inTrash && <HealthWarning health={health} onFix={onEdit} />}

        {item ? (
          <dl className="rounded-lg border border-border bg-surface">
            {item.username && (
              <Field label="Username" actions={<CopyButton value={item.username} label="Copy username" what="Username" />}>
                {item.username}
              </Field>
            )}
            <Field
              label="Password"
              mono
              actions={
                <>
                  <HealthChip health={health} />
                  <IconButton label={revealed ? "Hide password" : "Show password"} onClick={() => setRevealed((r) => !r)}>
                    {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconButton>
                  <CopyButton value={item.password} label="Copy password" what="Password" />
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

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">Updated {dateFormat.format(entry.updatedAt)} · Encrypted on this device</p>
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
      </div>
    </article>
  );
}

function Field({ label, mono, actions, children }: { label: string; mono?: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2 border-border py-3 pr-3 pl-4 not-first:border-t">
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
        <dd className={mono ? "font-mono text-[13px] break-all" : "wrap-break-word"}>{children}</dd>
      </div>
      <div className="flex items-center gap-0.5">{actions}</div>
    </div>
  );
}

/** Explains a weak or reused password in plain words, with the way to fix it. */
function HealthWarning({ health, onFix }: { health: ItemHealth | undefined; onFix: () => void }) {
  if (!health) return null;
  let message: string | null = null;
  if (health.reusedWith.length > 0) {
    const others = health.reusedWith.length === 1 ? health.reusedWith[0] : `${health.reusedWith.length} other items`;
    message = `This password is also used for ${others}. If one of those sites leaks it, this account is exposed too.`;
  } else if (health.strength === "weak") {
    message = "This password is easy to guess. Replace it with a generated one.";
  }
  if (!message) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-[13px]">
      <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      <Button variant="secondary" size="sm" onClick={onFix}>
        Change password
      </Button>
    </div>
  );
}
