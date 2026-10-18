import type { ZxcvbnFactory } from "@zxcvbn-ts/core";
import { useEffect, useState } from "react";

// zxcvbn estimates how many guesses a password would take, using dictionaries of common
// passwords, names and words. The dictionaries are large, so they load only on the screens
// that need them (registration, changing the master password).

export interface PasswordStrength {
  /** 0 (trivial) to 4 (very strong). */
  score: 0 | 1 | 2 | 3 | 4;
  warning: string | null;
}

/** Master passwords must score at least this. 3 means "safely unguessable" in zxcvbn's terms. */
export const MIN_MASTER_PASSWORD_SCORE = 3;

let checker: Promise<ZxcvbnFactory> | null = null;

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
    void loadChecker().then((zxcvbn) => {
      if (cancelled) return;
      // Words the user is likely to reuse (their email, the app's name) count as easy to guess.
      const result = zxcvbn.check(password, ["pass1", ...inputsKey.split("\n")]);
      setStrength({ score: result.score, warning: result.feedback.warning });
    });
    return () => {
      cancelled = true;
    };
  }, [password, inputsKey]);

  return strength;
}
