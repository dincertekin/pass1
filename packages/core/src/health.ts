import type { VaultEntry } from "./entries";

// Password health, worked out on the device from the decrypted vault. Nothing about it
// is sent anywhere: the server can't compare passwords it can't read.

export type Strength = "weak" | "good" | "strong";

export interface ItemHealth {
  /** null while the strength checker is still loading. */
  strength: Strength | null;
  /** Names of the other items that use the same password. */
  reusedWith: string[];
}

/** zxcvbn's 0–4 score as a word. Below 3 is guessable by a determined attacker. */
export function strengthFromScore(score: number): Strength {
  return score >= 4 ? "strong" : score === 3 ? "good" : "weak";
}

/** For each item, the other items (not in the trash) sharing its password. */
export function findReused(entries: VaultEntry[]): Map<string, string[]> {
  const byPassword = new Map<string, VaultEntry[]>();
  for (const entry of entries) {
    if (entry.deletedAt !== null || !entry.item?.password) continue;
    const group = byPassword.get(entry.item.password) ?? [];
    group.push(entry);
    byPassword.set(entry.item.password, group);
  }
  const reused = new Map<string, string[]>();
  for (const group of byPassword.values()) {
    if (group.length < 2) continue;
    for (const entry of group) {
      reused.set(entry.id, group.filter((other) => other !== entry).map((other) => other.item!.name));
    }
  }
  return reused;
}

/** Input: an item's health. Output: true when its password is weak or used elsewhere. */
export function hasIssue(health: ItemHealth | undefined): boolean {
  return !!health && (health.strength === "weak" || health.reusedWith.length > 0);
}

/**
 * The key a strength score is stored under: item and revision, never the password itself.
 * Input: an entry. Output: e.g. "1b9d...@3". A new revision gets scored again.
 */
export function healthScoreKey(entry: VaultEntry): string {
  return `${entry.id}@${entry.revision}`;
}
