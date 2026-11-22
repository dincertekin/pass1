// Each item gets a muted color for its tile, picked from its name, so the same site always
// has the same color and the list is easier to scan. Only initials: real site icons would
// mean fetching them from somewhere, which tells that server which sites you use.

export const TILE_COLORS = ["blue", "teal", "plum", "ochre", "brick", "moss", "slate"] as const;
export type TileColor = (typeof TILE_COLORS)[number];

/** Input: an item's name. Output: its tile color, the same for "GitHub" and " github ". */
export function tileColor(name: string): TileColor {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length]!;
}
