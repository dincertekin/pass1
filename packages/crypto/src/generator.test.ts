import { describe, expect, it } from "vitest";
import { EFF_WORDLIST } from "./eff-wordlist";
import {
  DEFAULT_PASSPHRASE_OPTIONS,
  DEFAULT_PASSWORD_OPTIONS,
  generatePassphrase,
  generatePassword,
  passphraseEntropyBits,
  passwordEntropyBits,
  randomInt,
} from "./generator";

describe("generatePassword", () => {
  it("has the requested length and at least one of every chosen kind", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 8 });
      expect(pw).toHaveLength(8);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%^&*\-_=+?]/);
    }
  });

  it("uses only the chosen kinds", () => {
    const pw = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, uppercase: false, symbols: false, length: 64 });
    expect(pw).toMatch(/^[a-z0-9]+$/);
  });

  it("leaves out look-alike characters when asked", () => {
    const pw = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 128 });
    expect(pw).not.toMatch(/[Il1O0o]/);
  });

  it("rejects impossible settings", () => {
    expect(() => generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 4 })).toThrow(RangeError);
    const nothing = { ...DEFAULT_PASSWORD_OPTIONS, lowercase: false, uppercase: false, digits: false, symbols: false };
    expect(() => generatePassword(nothing)).toThrow(RangeError);
  });

  it("is strong with the defaults", () => {
    expect(passwordEntropyBits(DEFAULT_PASSWORD_OPTIONS)).toBeGreaterThan(110);
  });
});

describe("generatePassphrase", () => {
  it("joins the requested number of words from the EFF list", () => {
    const words = generatePassphrase(DEFAULT_PASSPHRASE_OPTIONS).split("-");
    expect(words).toHaveLength(5);
    for (const word of words) expect(EFF_WORDLIST).toContain(word);
  });

  it("capitalizes and adds a number when asked", () => {
    const phrase = generatePassphrase({ words: 4, separator: " ", capitalize: true, includeNumber: true });
    const words = phrase.split(" ");
    expect(words).toHaveLength(4);
    expect(words.every((w) => /^[A-Z]/.test(w))).toBe(true);
    expect(words.filter((w) => /\d$/.test(w))).toHaveLength(1);
  });

  it("is strong with the defaults", () => {
    expect(passphraseEntropyBits(DEFAULT_PASSPHRASE_OPTIONS)).toBeCloseTo(64.6, 1);
  });
});

describe("EFF wordlist", () => {
  it("has 7776 unique words", () => {
    expect(EFF_WORDLIST).toHaveLength(7776);
    expect(new Set(EFF_WORDLIST).size).toBe(7776);
  });
});

describe("randomInt", () => {
  it("stays in range", () => {
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  // With 60,000 draws over 6 values, each should appear about 10,000 times. A biased
  // generator (like `% max` on a small range) or a broken one lands far outside ±5%.
  it("is uniform", () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60_000; i++) counts[randomInt(6)]++;
    for (const count of counts) expect(Math.abs(count - 10_000)).toBeLessThan(500);
  });
});
