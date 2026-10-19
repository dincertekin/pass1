import { describe, expect, it } from "vitest";
import { findReused, hasIssue, strengthFromScore } from "./health";
import type { VaultEntry } from "./vault-store";

function entry(id: string, name: string, password: string, deletedAt: number | null = null): VaultEntry {
  return { id, revision: 1, updatedAt: 0, deletedAt, size: 272, item: { name, password } };
}

describe("findReused", () => {
  it("links items that share a password, and only those", () => {
    const reused = findReused([
      entry("1", "Gmail", "same-pass"),
      entry("2", "Figma", "same-pass"),
      entry("3", "Bank", "unique"),
    ]);
    expect(reused.get("1")).toEqual(["Figma"]);
    expect(reused.get("2")).toEqual(["Gmail"]);
    expect(reused.has("3")).toBe(false);
  });

  it("ignores items in the trash", () => {
    const reused = findReused([entry("1", "Gmail", "same"), entry("2", "Old", "same", Date.now())]);
    expect(reused.size).toBe(0);
  });
});

describe("strengthFromScore", () => {
  it("treats anything below 3 as weak", () => {
    expect([0, 1, 2, 3, 4].map(strengthFromScore)).toEqual(["weak", "weak", "weak", "good", "strong"]);
  });
});

describe("hasIssue", () => {
  it("flags weak or reused passwords, not unknown ones", () => {
    expect(hasIssue({ strength: "weak", reusedWith: [] })).toBe(true);
    expect(hasIssue({ strength: "strong", reusedWith: ["Gmail"] })).toBe(true);
    expect(hasIssue({ strength: null, reusedWith: [] })).toBe(false);
    expect(hasIssue({ strength: "good", reusedWith: [] })).toBe(false);
  });
});
