/** "⌘" on Apple devices, "Ctrl+" elsewhere, for showing keyboard shortcuts. */
export const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl+";
