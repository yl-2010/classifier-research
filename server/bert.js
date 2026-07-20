/**
 * Client for the local BERT HTTP service (zero-shot + fine-tuned).
 * Never expose BERT_SERVICE_URL beyond 127.0.0.1.
 */

const DEFAULT_URL = "http://127.0.0.1:3003";

export function getBertServiceUrl() {
  return (process.env.BERT_SERVICE_URL || DEFAULT_URL).replace(/\/$/, "");
}

/**
 * @returns {{ ok: true, votes: object, fineTunedError?: string|null } | { ok: false, status: 'unavailable', error: string }}
 */
export async function classifyWithBert(rawText, { timeoutMs = 120_000 } = {}) {
  const base = getBertServiceUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: String(rawText || "").slice(0, 20000) }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        status: "unavailable",
        error: data?.error || `BERT service HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      votes: data.votes || {},
      fineTunedError: data.fineTunedError ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      status: "unavailable",
      error: err?.name === "AbortError" ? "BERT service timeout" : err?.message || "BERT fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeBertService() {
  const base = getBertServiceUrl();
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data?.ok === true, ...data };
  } catch (err) {
    return { ok: false, error: err?.message || "unreachable" };
  }
}

/** Map BERT service vote object into the API vote shape. */
export function normalizeBertVote(vote) {
  if (!vote || typeof vote !== "object") return null;
  return {
    subject: vote.subject ?? null,
    confidence: typeof vote.confidence === "number" ? vote.confidence : null,
    probs: vote.probs ?? null,
    latencyMs: vote.latencyMs ?? null,
    protocol: vote.protocol ?? null,
    model: vote.model ?? null,
  };
}
