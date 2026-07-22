import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type UiScreenContext = {
  /** e.g. home | research | about | voice | library | note */
  page: string;
  subject?: string | null;
  noteId?: string | null;
  noteTitle?: string | null;
  /** Full open-note text when a note is open. */
  noteText?: string | null;
};

type UiContextValue = {
  ui: UiScreenContext;
  setUiContext: (patch: Partial<UiScreenContext> | UiScreenContext) => void;
};

const DEFAULT_UI: UiScreenContext = { page: "home" };

const UiContext = createContext<UiContextValue>({
  ui: DEFAULT_UI,
  setUiContext: () => {},
});

export function UiContextProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiScreenContext>(DEFAULT_UI);

  const setUiContext = useCallback(
    (patch: Partial<UiScreenContext> | UiScreenContext) => {
      setUi((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const value = useMemo(() => ({ ui, setUiContext }), [ui, setUiContext]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUiContext() {
  return useContext(UiContext);
}
