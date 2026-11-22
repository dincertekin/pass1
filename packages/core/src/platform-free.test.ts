import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @pass1/core must run in a phone app, where there's no window, document or localStorage, and
// no Node either. TypeScript can't catch this (the package needs the DOM types for fetch and URL,
// and Node's for its tests), so this does.
const BROWSER_ONLY = /\b(window|document|localStorage|sessionStorage|navigator)\./;
const NODE_ONLY = /\b(process|Buffer)\.|from "node:|require\(/;
const SOURCE_DIR = new URL(".", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("@pass1/core", () => {
  it("uses no browser-only APIs, so it runs in a phone app too", () => {
    const offenders = sourceFiles(SOURCE_DIR).filter((file) => BROWSER_ONLY.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("uses no Node-only APIs either", () => {
    const offenders = sourceFiles(SOURCE_DIR).filter((file) => NODE_ONLY.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
