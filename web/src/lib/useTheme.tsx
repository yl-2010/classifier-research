import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { notelmsFetch, useNotelmsRuntimeConfig } from "./notelmsApi";
import {
  applyTheme,
  isThemePreference,
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const { apiBase } = useNotelmsRuntimeConfig();
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [ready, setReady] = useState(false);
  const profileLoaded = useRef(false);

  useEffect(() => {
    // Browser default until Mac profile settings arrive.
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

  useEffect(() => {
    if (!signedIn || !apiBase) {
      profileLoaded.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await notelmsFetch(apiBase, "/api/me");
        const data = (await res.json()) as {
          ok?: boolean;
          user?: { theme?: string };
        };
        if (cancelled || !res.ok || !data.ok) return;
        const theme = data.user?.theme;
        if (!isThemePreference(theme)) return;
        profileLoaded.current = true;
        setPreference(theme);
        setResolved(applyTheme(theme));
      } catch {
        /* Mac/tunnel may be offline — stay on browser default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, apiBase]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      setResolved(applyTheme(next));
      if (!signedIn || !apiBase) return;
      void notelmsFetch(apiBase, "/api/me", {
        method: "PATCH",
        body: JSON.stringify({ theme: next }),
      }).catch(() => {
        /* offline — local apply already done */
      });
    },
    [signedIn, apiBase]
  );

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
