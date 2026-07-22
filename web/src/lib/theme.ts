export type ThemePreference = "dark" | "system" | "light";
export type ResolvedTheme = "dark" | "light";

/** @deprecated Theme is session-only in the browser; not stored on USB / localStorage. */
export const THEME_STORAGE_KEY = "notelms-theme";

export const THEME_PREFERENCES: ThemePreference[] = ["dark", "system", "light"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "system" || value === "light";
}

/** Resolve preference against OS color scheme. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.setAttribute("data-theme", preference);
  root.setAttribute("data-resolved-theme", resolved);
  root.style.colorScheme = resolved;
  return resolved;
}

/** Inline bootstrap for `_document` — always system until the React theme provider runs. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var r=document.documentElement;r.setAttribute("data-theme","system");r.setAttribute("data-resolved-theme",d?"dark":"light");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
