import type { CSSProperties } from "react";

// Each item gets a muted color for its tile, picked from its name, so the same site always
// has the same color and the list is easier to scan. Only initials: real site icons would
// mean fetching them from somewhere, which tells that server which sites you use.

const TILE_COLORS = ["blue", "teal", "plum", "ochre", "brick", "moss", "slate"] as const;

export function tileColor(name: string): (typeof TILE_COLORS)[number] {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length]!;
}

/** Inline colors for a tile. `colorful: false` gives the plain grey look (Settings → General). */
export function tileStyle(name: string, colorful: boolean): CSSProperties {
  if (!colorful) return { background: "var(--color-sunken)", color: "var(--color-muted)" };
  const color = tileColor(name);
  return { background: `var(--color-tile-${color}-bg)`, color: `var(--color-tile-${color})` };
}
