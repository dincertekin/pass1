import { findReused, healthScoreKey as scoreKey, strengthFromScore, type ItemHealth, type VaultEntry } from "@pass1/core";
import { useEffect, useMemo, useState } from "react";
import { loadStrengthChecker } from "../lib/password-strength";

// The vault's password health as a React hook. The rules themselves are in @pass1/core,
// shared with the phone app; this part only loads the strength checker and keeps the scores.

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
