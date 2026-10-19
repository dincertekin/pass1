import type { ZxcvbnFactory } from "@zxcvbn-ts/core";
import { useEffect, useState } from "react";

// zxcvbn estimates how many guesses a password would take, using dictionaries of common
// passwords, names and words. The dictionaries are large, so they load only when first needed
// (registration, changing the master password, password health).

export interface PasswordStrength {
  /** 0 (trivial) to 4 (very strong). */
  score: 0 | 1 | 2 | 3 | 4;
  warning: string | null;
}

/** Master passwords must score at least this. 3 means "safely unguessable" in zxcvbn's terms. */
export const MIN_MASTER_PASSWORD_SCORE = 3;

let checker: Promise<ZxcvbnFactory> | null = null;

/** Loads the dictionaries once; later calls get the same checker. */
function loadChecker() {
  checker ??= Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
  ]).then(
    ([core, common, en]) =>
      new core.ZxcvbnFactory({
        dictionary: { ...common.dictionary, ...en.dictionary },
        graphs: common.adjacencyGraphs,
        translations: en.translations,
      }),
  );
  return checker;
}

export type StrengthChecker = (password: string, userInputs?: string[]) => PasswordStrength;

/**
 * Loads zxcvbn and returns a function that scores one password. Always use this, never
 * zxcvbn's own check(): zxcvbn keeps the last password it checked on its (long-lived) checker
 * object, so the master password from the register screen would stay in memory after the vault
 * locks. This checks an empty string straight after every real check, so nothing is left behind.
 * The heap test in apps/e2e/tests/security.spec.ts catches it if that ever stops working.
 */
export async function loadStrengthChecker(): Promise<StrengthChecker> {
  const zxcvbn = await loadChecker();
  return (password, userInputs = []) => {
    const result = zxcvbn.check(password, userInputs);
    zxcvbn.check("");
    return { score: result.score, warning: result.feedback.warning };
  };
}

/** Returns null while the dictionaries are loading or the password is empty. */
export function usePasswordStrength(password: string, userInputs: string[] = []): PasswordStrength | null {
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  const inputsKey = userInputs.join("\n");

  useEffect(() => {
    if (!password) {
      setStrength(null);
      return;
    }
    let cancelled = false;
    void loadStrengthChecker().then((check) => {
      if (cancelled) return;
      // Words the user is likely to reuse (their email, the app's name) count as easy to guess.
      setStrength(check(password, ["pass1", ...inputsKey.split("\n")]));
    });
    return () => {
      cancelled = true;
    };
  }, [password, inputsKey]);

  return strength;
}
