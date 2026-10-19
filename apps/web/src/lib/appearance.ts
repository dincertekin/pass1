import { getSettings, subscribeToSettings } from "./settings";

// Applies Settings → Appearance to the page. "system" removes the attribute, so the
// browser follows the operating system (see the color-scheme rules in styles/global.css).

function apply() {
  const { theme } = getSettings();
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Call once at startup. Keeps the page in step with the setting from then on. */
export function startAppearance() {
  apply();
  subscribeToSettings(apply);
}
