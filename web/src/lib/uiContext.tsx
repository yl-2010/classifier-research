import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
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

export type SubjectColorsUpdate = {
  colors?: Record<string, string>;
  label?: string;
  color?: string;
};

type UiContextValue = {
  ui: UiScreenContext;
  setUiContext: (patch: Partial<UiScreenContext> | UiScreenContext) => void;
  /** Library page registers this so chat can live-update accent colors. */
  setOnSubjectColorsUpdated: (
    handler: ((update: SubjectColorsUpdate) => void) | null
  ) => void;
  notifySubjectColorsUpdated: (update: SubjectColorsUpdate) => void;
};

const DEFAULT_UI: UiScreenContext = { page: "home" };

const UiContext = createContext<UiContextValue>({
  ui: DEFAULT_UI,
  setUiContext: () => {},
  setOnSubjectColorsUpdated: () => {},
  notifySubjectColorsUpdated: () => {},
});

export function UiContextProvider({ children }: { children: ReactNode }) {
  const [ui, setUi] = useState<UiScreenContext>(DEFAULT_UI);
  const colorsHandlerRef = useRef<
    ((update: SubjectColorsUpdate) => void) | null
  >(null);

  const setUiContext = useCallback(
    (patch: Partial<UiScreenContext> | UiScreenContext) => {
      setUi((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const setOnSubjectColorsUpdated = useCallback(
    (handler: ((update: SubjectColorsUpdate) => void) | null) => {
      colorsHandlerRef.current = handler;
    },
    []
  );

  const notifySubjectColorsUpdated = useCallback(
    (update: SubjectColorsUpdate) => {
      colorsHandlerRef.current?.(update);
    },
    []
  );

  const value = useMemo(
    () => ({
      ui,
      setUiContext,
      setOnSubjectColorsUpdated,
      notifySubjectColorsUpdated,
    }),
    [ui, setUiContext, setOnSubjectColorsUpdated, notifySubjectColorsUpdated]
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUiContext() {
  return useContext(UiContext);
}
