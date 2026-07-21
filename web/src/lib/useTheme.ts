import { useEffect, useState } from "react";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredTheme();
    const nextResolved = applyTheme(stored);
    setPreference(stored);
    setResolved(nextResolved);
    setReady(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      const current = readStoredTheme();
      if (current !== "system") return;
      setResolved(applyTheme("system"));
    };
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  const setTheme = (next: ThemePreference) => {
    setPreference(next);
    setResolved(persistTheme(next));
  };

  return {
    preference,
    resolved: ready ? resolved : resolveTheme(preference),
    ready,
    setTheme,
  };
}
