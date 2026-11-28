// Turns a message key into text in the person's language. Shared by every app; no library.
//
// Messages are plain strings with {placeholders}, or { one, other } where the count decides
// which ("1 item", "5 items"). Some languages have more forms (few, many...); add them to a
// message as needed and Intl.PluralRules picks the right one. Keys are typed, so a typo or a
// missing translation is a compile error, not a blank on screen.

import { EN } from "./en";

export type PluralMessage = { one?: string; few?: string; many?: string; other: string };
export type Message = string | PluralMessage;
export type MessageKey = keyof typeof EN;
/** A language's messages: every key English has, so nothing is ever missing. */
export type Messages = Record<MessageKey, Message>;
export type MessageParams = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Makes the translation function for one language.
 * Input: its messages and locale, e.g. (EN, "en"). Output: t("vault.search", { count: 3 }).
 */
export function createTranslator(messages: Messages, locale: string) {
  const plurals = pluralRulesFor(locale);
  return function t(key: MessageKey, params: MessageParams = {}): string {
    const message = messages[key];
    const text = typeof message === "string" ? message : pickPlural(message, plurals, params.count);
    return text.replace(PLACEHOLDER, (whole, name: string) => (name in params ? String(params[name]) : whole));
  };
}

export type Translate = ReturnType<typeof createTranslator>;

type PluralRules = Pick<Intl.PluralRules, "select">;

/**
 * The language's plural rules. Trap: React Native's JavaScript engine (Hermes) has no
 * Intl.PluralRules, and calling `new` on it crashed the phone app at startup. There the English
 * rule is used ("one" for 1, "other" otherwise), which is right for English, the only language
 * so far.
 * TODO: before shipping a language with other plural forms on the phone, add real rules for it
 * here (or a small polyfill), since this fallback would pick wrong forms.
 */
function pluralRulesFor(locale: string): PluralRules {
  if (typeof Intl !== "undefined" && typeof Intl.PluralRules === "function") return new Intl.PluralRules(locale);
  return { select: (count: number) => (count === 1 ? "one" : "other") };
}

function pickPlural(message: PluralMessage, plurals: PluralRules, count: string | number | undefined): string {
  const form = plurals.select(Number(count ?? 0)) as keyof PluralMessage;
  return message[form] ?? message.other;
}

/** Input: a message. Output: the names of its {placeholders}, in every plural form. */
export function placeholdersOf(message: Message): string[] {
  const texts = typeof message === "string" ? [message] : Object.values(message);
  return [...new Set(texts.flatMap((text) => [...(text ?? "").matchAll(PLACEHOLDER)].map((match) => match[1]!)))].sort();
}
