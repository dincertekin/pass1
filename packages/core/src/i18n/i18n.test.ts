import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "./en";
import { createTranslator, placeholdersOf, type Messages } from "./translate";

// Every language pass1 ships. A new one is added here, so the checks below cover it too.
const LANGUAGES: Record<string, Messages> = { en: EN };

// Where messages are used: the shared code and every app's source.
const SOURCE_DIRS = ["..", "../../../../apps/web/src", "../../../../apps/desktop/src"].map((dir) => new URL(dir, import.meta.url).pathname);

function sourceText(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceText(path);
      const isSource = /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && entry.name !== "en.ts";
      return isSource ? readFileSync(path, "utf8") : "";
    })
    .join("\n");
}

describe("Turning keys into text", () => {
  const t = createTranslator(EN, "en");

  it("fills in values", () => {
    expect(t("signup.sent", { email: "ada@example.com" })).toContain("We sent an email to ada@example.com.");
  });

  it("picks the right form for a count", () => {
    expect(t("list.search", { count: 1 })).toBe("Search 1 item");
    expect(t("list.search", { count: 5 })).toBe("Search 5 items");
    expect(t("list.search", { count: 0 })).toBe("Search 0 items");
  });

  it("leaves a placeholder visible when its value is missing, instead of printing undefined", () => {
    expect(t("signup.sent")).toContain("{email}");
  });
});

describe("The messages", () => {
  it("are all used somewhere, so the file holds no dead or misspelled keys", () => {
    const sources = SOURCE_DIRS.map(sourceText).join("\n");
    const unused = Object.keys(EN).filter((key) => !sources.includes(`"${key}"`));
    expect(unused).toEqual([]);
  });

  it("use the same placeholders in every language as in English", () => {
    for (const [language, messages] of Object.entries(LANGUAGES)) {
      for (const key of Object.keys(EN) as (keyof typeof EN)[]) {
        expect(placeholdersOf(messages[key]), `${language}: ${key}`).toEqual(placeholdersOf(EN[key]));
      }
    }
  });

  it("follow the writing rules: no exclamation marks, no em dashes", () => {
    for (const [language, messages] of Object.entries(LANGUAGES)) {
      for (const [key, message] of Object.entries(messages)) {
        const texts = typeof message === "string" ? [message] : Object.values(message);
        for (const text of texts) expect(text, `${language}: ${key}`).not.toMatch(/[!—]/);
      }
    }
  });
});
