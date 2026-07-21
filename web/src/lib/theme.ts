export type ThemePreference = "dark" | "system" | "light";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "notelms-theme";

export const THEME_PREFERENCES: ThemePreference[] = ["dark", "system", "light"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "system" || value === "light";
}

export function readStoredTheme(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

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

export function persistTheme(preference: ThemePreference): ResolvedTheme {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode / blocked storage */
  }
  return applyTheme(preference);
}

/** Inline bootstrap for `_document` — keep in sync with applyTheme(). */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t!=="dark"&&t!=="system"&&t!=="light")t="system";var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=t;r.dataset.resolvedTheme=d?"dark":"light";r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
