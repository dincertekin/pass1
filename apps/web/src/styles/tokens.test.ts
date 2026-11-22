import { COLORS, FONTS, RADII_PX, TILE_COLOR_VALUES, type ThemedColor } from "@pass1/core";
import { describe, expect, it } from "vitest";

// tokens.css is generated from @pass1/core's design tokens, so the web and the phone app can't
// drift apart. This test fails when the file is out of date; `npm run tokens` rewrites it.

const HEADER = `/*
 * pass1 design tokens for the web. Generated from packages/core/src/design-tokens.ts by
 * src/styles/tokens.test.ts. Don't edit this file: change the tokens there and run
 * \`npm run tokens\`.
 *
 * Tailwind turns each token into utilities: --color-surface → bg-surface, text-surface, border-surface…
 * Tailwind's default palette is removed on purpose: if a color isn't here, it isn't in the design.
 *
 * Every color is written as light-dark(<light>, <dark>). The browser picks one based on the
 * page's color-scheme, which follows the system unless Settings → Appearance sets
 * data-theme="light" or "dark" on <html> (see global.css). So components never need \`dark:\`.
 */
@import "tailwindcss";
`;

const TILES_COMMENT = `/*
 * Item tiles (see vault/tiles.ts). They're used from inline styles, not utility classes,
 * so \`static\` tells Tailwind to always include them.
 */`;

const lightDark = ({ light, dark }: ThemedColor) => `light-dark(${light}, ${dark})`;

/** Output: the whole tokens.css, as it should be. */
function renderTokensCss(): string {
  const colors = Object.entries(COLORS).map(([name, color]) => `  --color-${name}: ${lightDark(color)};`);
  const radii = Object.entries(RADII_PX).map(([name, px]) => `  --radius-${name}: ${px}px;`);
  const tiles = Object.entries(TILE_COLOR_VALUES).flatMap(([name, { text, background }]) => [
    `  --color-tile-${name}: ${lightDark(text)};`,
    `  --color-tile-${name}-bg: ${lightDark(background)};`,
  ]);
  return [
    HEADER,
    "@theme {",
    "  --color-*: initial;",
    "",
    ...colors,
    "",
    `  --font-sans: ${FONTS.sans};`,
    `  --font-mono: ${FONTS.mono};`,
    "",
    ...radii,
    "",
    "  --shadow-pop: 0 1px 2px var(--color-shadow), 0 8px 24px var(--color-shadow);",
    "  --shadow-dialog: 0 24px 60px var(--color-shadow);",
    "}",
    "",
    TILES_COMMENT,
    "@theme static {",
    ...tiles,
    "}",
    "",
  ].join("\n");
}

describe("Design tokens", () => {
  it("tokens.css matches @pass1/core's design tokens (run `npm run tokens` if not)", async () => {
    await expect(renderTokensCss()).toMatchFileSnapshot("./tokens.css");
  });
});
