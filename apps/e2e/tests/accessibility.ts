import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { Page } from "@playwright/test";

// Runs axe (the axe-core accessibility checker) on the current page. It's injected through
// Playwright's evaluate, which runs outside the page's Content-Security-Policy, so the app's
// strict policy stays exactly as it is in production.

const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
// WCAG 2.1, levels A and AA: what accessibility laws in the EU and US refer to.
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface AxeResult {
  violations: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }[];
}

/**
 * Checks the page against WCAG 2.1 AA.
 * Output: one readable line per problem, e.g. "color-contrast (serious) Elements must meet... at .button".
 * An empty list means axe found nothing.
 */
export async function accessibilityProblems(page: Page): Promise<string[]> {
  // Mid-animation, a fading dialog is half transparent and every color in it fails contrast.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  await page.evaluate(AXE_SOURCE);
  const result = await page.evaluate(async (tags) => {
    const axe = (window as unknown as { axe: { run(context: Document, options: object): Promise<AxeResult> } }).axe;
    return axe.run(document, { runOnly: { type: "tag", values: tags } });
  }, WCAG_TAGS);
  return result.violations.map(
    (violation) => `${violation.id} (${violation.impact}) ${violation.help} at ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
}
