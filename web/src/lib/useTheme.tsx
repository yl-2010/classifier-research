import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  ready: boolean;
  setTheme: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  resolved: "light",
  ready: false,
  setTheme: () => {},
});

/**
 * Session-only theme: defaults to system on load / refresh.
 * Not read from or written to the Mac USB profile.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const nextResolved = applyTheme("system");
    setPreference("system");
    setResolved(nextResolved);
    setReady(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      setPreference((current) => {
        if (current !== "system") return current;
        setResolved(applyTheme("system"));
        return current;
      });
    };
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    setResolved(applyTheme(next));
  }, []);

  const value = useMemo(
    () => ({
      preference,
      resolved: ready ? resolved : resolveTheme(preference),
      ready,
      setTheme,
    }),
    [preference, resolved, ready, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
