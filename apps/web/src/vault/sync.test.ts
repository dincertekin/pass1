import { describe, expect, it } from "vitest";
import { mergeSyncedEntries } from "./sync";
import type { VaultEntry } from "./vault-store";

function entry(id: string, revision = 1, name = "GitHub"): VaultEntry {
  return { id, revision, updatedAt: 0, deletedAt: null, size: 272, item: { name, password: "x" } };
}

describe("Folding synced changes into the vault", () => {
  it("the first sync becomes the vault", () => {
    expect(mergeSyncedEntries(null, [entry("a")], [], true)).toEqual([entry("a")]);
  });

  it("a change from another device replaces the old copy, and new items are added", () => {
    const merged = mergeSyncedEntries([entry("a", 1, "Old"), entry("b")], [entry("a", 2, "New"), entry("c")], [], false);
    expect(merged).toEqual([entry("a", 2, "New"), entry("b"), entry("c")]);
  });

  it("a slow sync never undoes a save made on this device in the meantime", () => {
    const merged = mergeSyncedEntries([entry("a", 3, "Just saved")], [entry("a", 2, "Older")], [], false);
    expect(merged).toEqual([entry("a", 3, "Just saved")]);
  });

  it("items deleted forever on another device disappear", () => {
    expect(mergeSyncedEntries([entry("a"), entry("b")], [], ["a"], false)).toEqual([entry("b")]);
  });

  it("a full copy from the server replaces everything, even items only this device had", () => {
    expect(mergeSyncedEntries([entry("gone")], [entry("a")], [], true)).toEqual([entry("a")]);
  });
});
