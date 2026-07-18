import { useEffect, useState } from "react";

export type NotelmsRuntimeConfig = {
  apiBase: string | null;
  loading: boolean;
  error: string | null;
};

/**
 * Resolve the Mac API base URL.
 * 1) NEXT_PUBLIC_NOTELMS_API_BASE env override
 * 2) /runtime-config.json from the site origin
 */
export function useNotelmsRuntimeConfig(): NotelmsRuntimeConfig {
  const envBase =
    typeof process.env.NEXT_PUBLIC_NOTELMS_API_BASE === "string"
      ? process.env.NEXT_PUBLIC_NOTELMS_API_BASE.trim() || null
      : null;

  const [apiBase, setApiBase] = useState<string | null>(envBase);
  const [loading, setLoading] = useState(!envBase);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (envBase) {
      setApiBase(envBase);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/runtime-config.json", { cache: "no-store" });
        if (!res.ok) throw new Error(`runtime-config ${res.status}`);
        const data = (await res.json()) as { apiBase?: string | null };
        if (!cancelled) {
          setApiBase(
            typeof data.apiBase === "string" && data.apiBase.trim()
              ? data.apiBase.trim()
              : null
          );
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "config failed");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [envBase]);

  return { apiBase, loading, error };
}

/** Fetch a short-lived Mac API token from the Vercel Next route. */
export async function fetchMacToken(): Promise<string> {
  const res = await fetch("/api/mac-token", { credentials: "same-origin" });
  const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
  if (!res.ok || !data.token) {
    throw new Error(data.error || `mac-token ${res.status}`);
  }
  return data.token;
}
