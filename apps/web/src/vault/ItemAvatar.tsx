import { clsx } from "clsx";
import { useSettings } from "../lib/settings";
import { displayName } from "./entries";
import { tileStyle } from "./tiles";
import type { VaultEntry } from "./vault-store";

const sizes = {
  md: "size-9 rounded-lg text-[15px]",
  lg: "size-13 rounded-xl text-[22px]",
};

/** A colored tile with the item's initial (see tiles.ts for why there are no site icons). */
export function ItemAvatar({ entry, size = "md" }: { entry: VaultEntry; size?: keyof typeof sizes }) {
  const { colorfulTiles } = useSettings();
  if (!entry.item) {
    return (
      <span aria-hidden="true" className={clsx("grid shrink-0 place-items-center bg-danger-soft font-semibold text-danger", sizes[size])}>
        !
      </span>
    );
  }
  const name = displayName(entry);
  return (
    <span aria-hidden="true" className={clsx("grid shrink-0 place-items-center font-semibold", sizes[size])} style={tileStyle(name, colorfulTiles)}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
