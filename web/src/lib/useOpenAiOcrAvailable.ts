import { useEffect, useState } from "react";
import { useNotelmsRuntimeConfig } from "./useNotelmsRuntimeConfig";

/**
 * Whether OpenAI vision OCR is currently usable (key present and accepted).
 * Public /health — no auth required. Fail closed when unreachable.
 */
export function useOpenAiOcrAvailable(): {
  available: boolean;
  loading: boolean;
} {
  const { apiBase, loading: configLoading } = useNotelmsRuntimeConfig();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (configLoading) return;
    if (!apiBase) {
      setAvailable(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase.replace(/\/$/, "")}/health`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          openaiOcr?: { ok?: boolean };
        };
        if (!cancelled) {
          setAvailable(Boolean(data?.openaiOcr?.ok));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAvailable(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase, configLoading]);

  return { available, loading };
}
