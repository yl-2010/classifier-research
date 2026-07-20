/**
 * Proxy helpers for the local Orpheus TTS sidecar (127.0.0.1:5050).
 * Browser never talks to LM Studio or the sidecar directly.
 */

export function getTtsBaseUrl() {
  return (process.env.NOTELMS_TTS_URL || "http://127.0.0.1:5050").replace(
    /\/$/,
    ""
  );
}

/**
 * @param {string} path
 * @param {RequestInit & { timeoutMs?: number }} [opts]
 */
export async function ttsFetch(path, opts = {}) {
  const { timeoutMs = 10_000, ...init } = opts;
  const url = `${getTtsBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const signal =
    init.signal ||
    (timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined);
  return fetch(url, { ...init, signal });
}
