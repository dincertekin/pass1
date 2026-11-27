import { createTranslator, EN, type MessageKey } from "@pass1/core";
import { Fragment, type ReactNode } from "react";

// The web app's translations. Messages live in @pass1/core (i18n/en.ts), shared with the phone
// app. English is the only language so far; another one is a new file there, picked here by
// navigator.language.

export const t = createTranslator(EN, "en");

/**
 * Like t(), for sentences with formatting inside, e.g. "We sent an email to {email}." with
 * the address in bold: tx("signup.sent", { email: <strong>{address}</strong> }).
 * The whole sentence stays one message, so a translator can move the bold part anywhere.
 */
export function tx(key: MessageKey, parts: Record<string, ReactNode>): ReactNode {
  const marker = (name: string) => `\u0000${name}\u0000`;
  const text = t(key, Object.fromEntries(Object.keys(parts).map((name) => [name, marker(name)])));
  return text.split("\u0000").map((piece, i) => <Fragment key={i}>{i % 2 === 1 ? parts[piece] : piece}</Fragment>);
}
