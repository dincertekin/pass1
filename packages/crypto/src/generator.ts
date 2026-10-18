import { EFF_WORDLIST } from "./eff-wordlist";
import { PASSPHRASE_WORDS, PASSWORD_LENGTH, type PassphraseOptions, type PasswordOptions } from "./generator-options";

// Random passwords and passphrases. Imported separately as "@pass1/crypto/generator",
// so the 60 KB wordlist only loads when someone opens the generator.

export * from "./generator-options";

// Symbols most sites accept and that are easy to type on phone keyboards.
const CHARACTER_SETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*-_=+?",
} as const;

const AMBIGUOUS = new Set("Il1O0o");

export function generatePassword(options: PasswordOptions): string {
  if (options.length < PASSWORD_LENGTH.min || options.length > PASSWORD_LENGTH.max) {
    throw new RangeError(`Password length must be between ${PASSWORD_LENGTH.min} and ${PASSWORD_LENGTH.max}`);
  }
  const sets = enabledSets(options);
  if (sets.length === 0) throw new RangeError("Choose at least one kind of character");

  // One character from every chosen set, so sites that require "a digit and a symbol"
  // always accept it. The rest come from all chosen sets together, then everything is shuffled.
  const all = sets.join("");
  const chars = sets.map(pick);
  while (chars.length < options.length) chars.push(pick(all));
  return shuffle(chars).join("");
}

export function generatePassphrase(options: PassphraseOptions): string {
  if (options.words < PASSPHRASE_WORDS.min || options.words > PASSPHRASE_WORDS.max) {
    throw new RangeError(`Passphrases need between ${PASSPHRASE_WORDS.min} and ${PASSPHRASE_WORDS.max} words`);
  }
  const words = Array.from({ length: options.words }, () => EFF_WORDLIST[randomInt(EFF_WORDLIST.length)]!);
  const shaped = options.capitalize ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)) : words;
  if (options.includeNumber) {
    const i = randomInt(shaped.length);
    shaped[i] += String(randomInt(10));
  }
  return shaped.join(options.separator);
}

/**
 * Roughly how many guesses an attacker who knows these settings would need, as bits (log2).
 * 80+ bits is beyond any realistic attack on a single password.
 */
export function passwordEntropyBits(options: PasswordOptions): number {
  return options.length * Math.log2(enabledSets(options).join("").length || 1);
}

export function passphraseEntropyBits(options: PassphraseOptions): number {
  const words = options.words * Math.log2(EFF_WORDLIST.length);
  return options.includeNumber ? words + Math.log2(10 * options.words) : words;
}

function enabledSets(options: PasswordOptions): string[] {
  return (Object.keys(CHARACTER_SETS) as (keyof typeof CHARACTER_SETS)[])
    .filter((name) => options[name])
    .map((name) => [...CHARACTER_SETS[name]].filter((c) => !options.avoidAmbiguous || !AMBIGUOUS.has(c)).join(""));
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

/** Fisher–Yates: every order is equally likely. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/**
 * A uniformly random integer from 0 to max - 1.
 *
 * `random % max` would make small numbers slightly more likely whenever 2^32 isn't a multiple
 * of max. Instead, values from the uneven tail are thrown away and drawn again.
 */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError("max must be an integer from 1 to 2^32");
  const limit = 2 ** 32 - (2 ** 32 % max);
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0]! < limit) return buffer[0]! % max;
  }
}
