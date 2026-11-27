import { EN } from "./en";
import { createTranslator } from "./translate";

/**
 * English, for the `.message` of errors thrown in core: readable in logs and tests. Apps show
 * the error's messageKey in the person's language instead.
 */
export const englishText = createTranslator(EN, "en");
