import { useEffect, useMemo, useState } from "react";
import { loadStrengthChecker } from "../lib/password-strength";
import type { VaultEntry } from "./vault-store";

// Password health, worked out here in the browser from the decrypted vault. Nothing about it
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

export function hasIssue(health: ItemHealth | undefined): boolean {
  return !!health && (health.strength === "weak" || health.reusedWith.length > 0);
}

/**
 * Health for every item. Reuse is known at once; strength appears once the checker's
 * dictionaries have loaded, scored a few items at a time so the page stays responsive.
 *
 * Scores are kept in this component's state, keyed by item and revision, never by password:
 * when the vault locks and this unmounts, they're gone with it.
 */
export function useVaultHealth(entries: VaultEntry[]): Map<string, ItemHealth> {
  const [scores, setScores] = useState<Map<string, number>>(new Map());
  const reused = useMemo(() => findReused(entries), [entries]);

  useEffect(() => {
    let cancelled = false;
    const todo = entries.filter((e) => e.item && !scores.has(scoreKey(e)));
    if (todo.length === 0) return;

    void loadStrengthChecker().then(async (check) => {
      const found = new Map<string, number>();
      for (let i = 0; i < todo.length; i++) {
        if (cancelled) return;
        const { item } = todo[i]!;
        const hints = [item!.name, item!.username ?? "", item!.url ?? ""];
        found.set(scoreKey(todo[i]!), check(item!.password, hints).score);
        // Yield every few items so typing and scrolling stay smooth on big vaults.
        if (i % 20 === 19) await new Promise((resolve) => setTimeout(resolve));
      }
      if (!cancelled) setScores((prev) => new Map([...prev, ...found]));
    });
    return () => {
      cancelled = true;
    };
    // `scores` is left out on purpose: re-running when it changes would only find nothing to do.
  }, [entries]);

  return useMemo(() => {
    const health = new Map<string, ItemHealth>();
    for (const entry of entries) {
      const score = scores.get(scoreKey(entry));
      health.set(entry.id, {
        strength: score === undefined ? null : strengthFromScore(score),
        reusedWith: reused.get(entry.id) ?? [],
      });
    }
    return health;
  }, [entries, scores, reused]);
}

function scoreKey(entry: VaultEntry) {
  return `${entry.id}@${entry.revision}`;
}
