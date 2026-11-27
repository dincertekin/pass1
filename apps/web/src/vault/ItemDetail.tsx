import { AlertTriangle, ArrowLeft, ExternalLink, Eye, EyeOff, Star } from "lucide-react";
import { useState, type ReactNode, type RefObject } from "react";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { IconButton } from "../components/ui/IconButton";
import { errorMessage } from "../session/session";
import { CopyButton } from "./CopyButton";
import { safeHref } from "@pass1/core";
import type { ItemHealth } from "@pass1/core";
import { HealthChip } from "./HealthChip";
import { ItemAvatar } from "./ItemAvatar";
import type { VaultEntry } from "@pass1/core";
import { useVault } from "./vault-store";
import { t } from "../lib/i18n";
import { itemName } from "./item-name";

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
          <ArrowLeft size={14} /> {t("common.back")}
        </Button>

        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <ItemAvatar entry={entry} size="lg" />
            <div className="min-w-0">
              <h2 ref={headingRef} tabIndex={-1} className="truncate text-[22px] font-semibold tracking-tight outline-none">
                {itemName(entry)}
              </h2>
              <p className="truncate text-[13px] text-muted">{inTrash ? t("item.inTrash") : href ? new URL(href).hostname : t("item.noWebsite")}</p>
            </div>
          </div>
          {item && !inTrash && (
            <div className="flex items-center gap-1.5">
              <IconButton
                label={item.favorite ? t("item.removeFavorite") : t("item.addFavorite")}
                aria-pressed={item.favorite === true}
                onClick={() => run(() => vault.update(entry, { ...item, favorite: !item.favorite }))}
              >
                <Star size={16} className={item.favorite ? "fill-accent text-accent" : undefined} />
              </IconButton>
              <Button variant="secondary" size="sm" onClick={onEdit}>
                {t("common.edit")}
              </Button>
            </div>
          )}
        </header>

        {error && <Alert>{error}</Alert>}

        {item && !inTrash && <HealthWarning health={health} onFix={onEdit} />}

        {item ? (
          <dl className="rounded-lg border border-border bg-surface">
            {item.username && (
              <Field label={t("item.username")} actions={<CopyButton value={item.username} label={t("item.copyUsername")} what={t("item.username")} />}>
                {item.username}
              </Field>
            )}
            <Field
              label={t("item.password")}
              mono
              actions={
                <>
                  <HealthChip health={health} />
                  <IconButton label={revealed ? t("item.hidePassword") : t("item.showPassword")} onClick={() => setRevealed((r) => !r)}>
                    {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconButton>
                  <CopyButton value={item.password} label={t("item.copyPassword")} what={t("item.password")} />
                </>
              }
            >
              {revealed ? item.password : "•".repeat(14)}
            </Field>
            {item.url && (
              <Field
                label={t("item.website")}
                actions={
                  href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("item.openWebsite")}
                      title={t("item.openWebsite")}
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
          <Alert>{t("item.undecryptable")}</Alert>
        )}

        {item?.notes && (
          <section className="grid gap-1">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t("item.notes")}</h3>
            <p className="text-[13px] whitespace-pre-wrap">{item.notes}</p>
          </section>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">{t("item.updated", { date: dateFormat.format(entry.updatedAt) })}</p>
          {inTrash ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => run(() => vault.restore(entry))}>
                {t("item.restore")}
              </Button>
              <ConfirmDialog
                trigger={<Button variant="danger" size="sm">{t("item.deleteForever")}</Button>}
                title={t("item.deleteForeverTitle", { name: itemName(entry) })}
                description={t("item.deleteForeverDescription")}
                confirmLabel={t("item.deleteForever")}
                onConfirm={() => run(() => vault.remove(entry))}
              />
            </div>
          ) : (
            <Button variant="danger" size="sm" onClick={() => run(() => vault.trash(entry))}>
              {t("item.moveToTrash")}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Field({ label, mono, actions, children }: { label: string; mono?: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    // <dt> and <dd> must be direct children of this row, or screen readers lose which label goes
    // with which value. So the buttons live inside the <dd>, next to the value they act on.
    <div className="border-border py-3 pr-3 pl-4 not-first:border-t">
      <dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="flex items-center gap-2">
        <div className={mono ? "min-w-0 flex-1 font-mono text-[13px] break-all" : "min-w-0 flex-1 wrap-break-word"}>{children}</div>
        <div className="flex items-center gap-0.5">{actions}</div>
      </dd>
    </div>
  );
}

/** Explains a weak or reused password in plain words, with the way to fix it. */
function HealthWarning({ health, onFix }: { health: ItemHealth | undefined; onFix: () => void }) {
  if (!health) return null;
  let message: string | null = null;
  if (health.reusedWith.length > 0) {
    message =
      health.reusedWith.length === 1
        ? t("health.reusedWithItem", { name: health.reusedWith[0]! })
        : t("health.reusedWithItems", { count: health.reusedWith.length });
  } else if (health.strength === "weak") {
    message = t("health.weak");
  }
  if (!message) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5 text-[13px]">
      <AlertTriangle size={16} className="shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      <Button variant="secondary" size="sm" onClick={onFix}>
        {t("health.changePassword")}
      </Button>
    </div>
  );
}
