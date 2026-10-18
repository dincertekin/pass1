// Generator settings, separate from generator.ts so the app can store and validate them
// without loading the wordlist.

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leaves out characters that look alike in many fonts: I l 1 O 0 o */
  avoidAmbiguous: boolean;
}

export const PASSPHRASE_SEPARATORS = ["-", " ", ".", "_"] as const;

export interface PassphraseOptions {
  words: number;
  separator: (typeof PASSPHRASE_SEPARATORS)[number];
  capitalize: boolean;
  /** Adds one random digit to one random word, for sites that demand a number. */
  includeNumber: boolean;
}

export const PASSWORD_LENGTH = { min: 8, max: 128 } as const;
export const PASSPHRASE_WORDS = { min: 3, max: 12 } as const;

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
};

export const DEFAULT_PASSPHRASE_OPTIONS: PassphraseOptions = {
  words: 5,
  separator: "-",
  capitalize: false,
  includeNumber: false,
};
