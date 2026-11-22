import { tileColor } from "@pass1/core";
import type { CSSProperties } from "react";

// The web's tile styles. Which color an item gets is decided in @pass1/core (tiles.ts).

/** Inline colors for a tile. `colorful: false` gives the plain grey look (Settings → General). */
export function tileStyle(name: string, colorful: boolean): CSSProperties {
  if (!colorful) return { background: "var(--color-sunken)", color: "var(--color-muted)" };
  const color = tileColor(name);
  return { background: `var(--color-tile-${color}-bg)`, color: `var(--color-tile-${color})` };
}
