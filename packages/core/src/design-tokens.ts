// pass1's design tokens: the one place colors, fonts and corner radii are decided, so the web
// app and the phone app look like the same product. The web's CSS (apps/web/src/styles/tokens.css)
// is generated from this file; run `npm run tokens` after changing it.
//
// Every color has a light and a dark value. Semantic colors (danger, warning, success) are only
// for meaning, such as a weak or reused password, never for decoration.

import type { TileColor } from "./tiles";

export interface ThemedColor {
  light: string;
  dark: string;
}

const themed = (light: string, dark: string): ThemedColor => ({ light, dark });

/** Neutrals lean slightly blue-green, toward the Prussian blue accent. */
export const COLORS = {
  bg: themed("#f4f6f5", "#0e1113"),
  surface: themed("#ffffff", "#15191c"),
  sunken: themed("#ecefee", "#0b0d0f"),
  sidebar: themed("#eceeed", "#111416"),
  border: themed("#d8dddb", "#262c30"),
  "border-strong": themed("#bcc3c1", "#353d42"),
  text: themed("#15191c", "#e5e9ea"),
  muted: themed("#5b646a", "#8c969b"),

  accent: themed("#1e4d78", "#79aadb"),
  "accent-hover": themed("#173d60", "#98bfe6"),
  "accent-soft": themed("#e3ecf4", "#17283a"),
  "accent-line": themed("#c9d6e3", "#24405c"),
  "on-accent": themed("#ffffff", "#0b1218"),

  danger: themed("#b42318", "#f07a6c"),
  "danger-soft": themed("#fbe9e7", "#3a1714"),
  "danger-line": themed("#efc4bd", "#5c2620"),
  warning: themed("#8f5b00", "#e2aa4c"),
  "warning-soft": themed("#faf0dc", "#33250c"),
  "warning-line": themed("#e7cf9c", "#574016"),
  success: themed("#2c7046", "#6cc490"),
  "success-soft": themed("#e5f2ea", "#11291b"),

  /** Dims the page behind dialogs. */
  scrim: themed("rgb(16 24 28 / 0.35)", "rgb(0 0 0 / 0.6)"),
  shadow: themed("rgb(16 24 28 / 0.1)", "rgb(0 0 0 / 0.5)"),
} as const satisfies Record<string, ThemedColor>;

/** Item tiles: muted pairs, one per tile color (see tiles.ts for which item gets which). */
export const TILE_COLOR_VALUES: Record<TileColor, { text: ThemedColor; background: ThemedColor }> = {
  blue: { text: themed("#1e4d78", "#9cc0e6"), background: themed("#dfe8f2", "#1a2a3b") },
  teal: { text: themed("#1f6157", "#8fd1c4"), background: themed("#dcefeb", "#14302b") },
  plum: { text: themed("#5b3a6e", "#cdb1dd"), background: themed("#ece3f0", "#2c2035") },
  ochre: { text: themed("#7a5410", "#e3c27f"), background: themed("#f4ead8", "#352a14") },
  brick: { text: themed("#8c3a2b", "#eba796"), background: themed("#f5e1dc", "#3a1e18") },
  moss: { text: themed("#3f6326", "#b0d295"), background: themed("#e3eedb", "#1f2e15") },
  slate: { text: themed("#3b4752", "#b8c3cd"), background: themed("#e4e8ec", "#232a31") },
};

/** Font stacks for the web. A phone app uses its platform's system font and a bundled JetBrains Mono. */
export const FONTS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;

/** Corner radii in pixels. */
export const RADII_PX = {
  sm: 4,
  md: 6,
  lg: 10,
  xl: 14,
} as const;
