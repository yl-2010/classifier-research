export type ThemePreference = "dark" | "system" | "light";
export type ResolvedTheme = "dark" | "light";

/** @deprecated Theme is stored on the Mac Studio profile, not localStorage. */
export const THEME_STORAGE_KEY = "notelms-theme";

export const THEME_PREFERENCES: ThemePreference[] = ["dark", "system", "light"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "system" || value === "light";
}

/** Browser / OS preference — used until Mac profile settings load. */
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
  root.dataset.theme = preference;
  root.dataset.resolvedTheme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}

/** Inline bootstrap for `_document` — always browser default until profile loads. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var r=document.documentElement;r.dataset.theme="system";r.dataset.resolvedTheme=d?"dark":"light";r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
