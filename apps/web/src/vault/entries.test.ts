import { describe, expect, it } from "vitest";
import { hostOf, inSection, matchesQuery, safeHref } from "./entries";
import type { VaultEntry } from "./vault-store";

function entry(overrides: Partial<VaultEntry> = {}, item: VaultEntry["item"] = { name: "GitHub", password: "x" }): VaultEntry {
  return { id: "1", revision: 1, updatedAt: 0, deletedAt: null, size: 272, item, ...overrides };
}

describe("safeHref", () => {
  it("adds https:// to a bare domain", () => {
    expect(safeHref("github.com/login")).toBe("https://github.com/login");
  });

  it("keeps http and https links", () => {
    expect(safeHref("http://192.168.1.1")).toBe("http://192.168.1.1/");
  });

  // A malicious or careless value must never become a clickable script.
  it("refuses javascript:, data: and other schemes", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("  JavaScript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHref("file:///etc/passwd")).toBeNull();
  });

  it("returns null for empty or unparseable input", () => {
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref("   ")).toBeNull();
    expect(safeHref("https://")).toBeNull();
  });
});

describe("hostOf", () => {
  it("shows just the host, without www", () => {
    expect(hostOf("https://www.github.com/login")).toBe("github.com");
  });
});

describe("inSection", () => {
  const trashed = entry({ deletedAt: 1 });
  const favorite = entry({}, { name: "Bank", password: "x", favorite: true });

  it("keeps trashed items out of All and Favorites", () => {
    expect(inSection(trashed, "all")).toBe(false);
    expect(inSection(trashed, "trash")).toBe(true);
    expect(inSection(entry({ deletedAt: 1 }, { name: "B", password: "x", favorite: true }), "favorites")).toBe(false);
  });

  it("shows favorites in both All and Favorites", () => {
    expect(inSection(favorite, "all")).toBe(true);
    expect(inSection(favorite, "favorites")).toBe(true);
    expect(inSection(entry(), "favorites")).toBe(false);
  });
});

describe("matchesQuery", () => {
  const item = entry({}, { name: "GitHub", username: "ada-dev", url: "github.com", password: "secret-hunter2", notes: "recovery codes" });

  it("searches name, website and username, ignoring case", () => {
    expect(matchesQuery(item, "GIT")).toBe(true);
    expect(matchesQuery(item, "ada-dev")).toBe(true);
  });

  it("never matches on passwords or notes", () => {
    expect(matchesQuery(item, "hunter2")).toBe(false);
    expect(matchesQuery(item, "recovery")).toBe(false);
  });

  it("lists unreadable items only when there's no query", () => {
    expect(matchesQuery(entry({}, null), "")).toBe(true);
    expect(matchesQuery(entry({}, null), "git")).toBe(false);
  });
});
