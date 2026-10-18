import { clsx } from "clsx";
import type { VaultEntry } from "./vault-store";
import { displayName } from "./entries";

/** First letter of the item's name. No favicons: fetching one would tell a third party which sites you use. */
export function ItemAvatar({ entry, size = "md" }: { entry: VaultEntry; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "grid shrink-0 place-items-center rounded-sm border border-border bg-sunken font-semibold text-muted",
        size === "md" ? "size-7 text-xs" : "size-10 text-base",
        !entry.item && "text-danger",
      )}
    >
      {entry.item ? displayName(entry).charAt(0).toUpperCase() : "!"}
    </span>
  );
}
