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
  const plurals = new Intl.PluralRules(locale);
  return function t(key: MessageKey, params: MessageParams = {}): string {
    const message = messages[key];
    const text = typeof message === "string" ? message : pickPlural(message, plurals, params.count);
    return text.replace(PLACEHOLDER, (whole, name: string) => (name in params ? String(params[name]) : whole));
  };
}

export type Translate = ReturnType<typeof createTranslator>;

function pickPlural(message: PluralMessage, plurals: Intl.PluralRules, count: string | number | undefined): string {
  const form = plurals.select(Number(count ?? 0)) as keyof PluralMessage;
  return message[form] ?? message.other;
}

/** Input: a message. Output: the names of its {placeholders}, in every plural form. */
export function placeholdersOf(message: Message): string[] {
  const texts = typeof message === "string" ? [message] : Object.values(message);
  return [...new Set(texts.flatMap((text) => [...(text ?? "").matchAll(PLACEHOLDER)].map((match) => match[1]!)))].sort();
}
