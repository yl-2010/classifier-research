/**
 * GPT-OSS classify / format / orchestrate + BERT votes via local BERT service.
 */

import { chatCompletions } from "./lmstudio.js";
import { classifyWithBert, normalizeBertVote } from "./bert.js";
import { FIXED_SUBJECTS, OTHER_SUBJECT, normalizeSubjectLabel } from "./subjects.js";

export function extractJsonObject(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Zero-shot subject classification via openai/gpt-oss-20b.
 * Returns one of the 8 fixed subjects, or Other (+ optional customSuggestion).
 */
export async function classifyWithGptOss(rawText, { customSubjects = [] } = {}) {
  const customList =
    Array.isArray(customSubjects) && customSubjects.length
      ? customSubjects.join(", ")
      : "(none)";

  const system = [
    "You classify student study notes into academic subjects.",
    `Allowed fixed subjects: ${FIXED_SUBJECTS.join(", ")}.`,
    `If none of the eight fit, use subject "${OTHER_SUBJECT}" and optionally suggest a short custom subject name.`,
    "Respond with a single JSON object only, no markdown.",
    'Schema: {"subject": string, "confidence": number, "rationale": string, "customSuggestion": string|null}',
    "confidence is 0..1.",
  ].join(" ");

  const user = [
    `User custom subjects (for Other path): ${customList}`,
    "",
    "Notes:",
    rawText.slice(0, 12000),
  ].join("\n");

  const started = Date.now();
  const result = await chatCompletions({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    maxTokens: 512,
    json: true,
  });
  const latencyMs = Date.now() - started;

  const parsed = extractJsonObject(result.content) || {};
  let subject = normalizeSubjectLabel(parsed.subject) || OTHER_SUBJECT;
  if (
    subject !== OTHER_SUBJECT &&
    !FIXED_SUBJECTS.includes(subject) &&
    !customSubjects.some((c) => c.toLowerCase() === subject.toLowerCase())
  ) {
    parsed.customSuggestion = parsed.customSuggestion || subject;
    subject = OTHER_SUBJECT;
  }

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    subject,
    confidence,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    customSuggestion:
      typeof parsed.customSuggestion === "string" && parsed.customSuggestion.trim()
        ? parsed.customSuggestion.trim()
        : null,
    model: result.model,
    latencyMs,
    usage: result.usage,
  };
}

/**
 * Run GPT-OSS + BERT arms in parallel, then orchestrate a final subject.
 */
export async function classifyEnsemble(rawText, { customSubjects = [] } = {}) {
  const [gptOss, bertResult] = await Promise.all([
    classifyWithGptOss(rawText, { customSubjects }),
    classifyWithBert(rawText),
  ]);

  let bertStatus = { status: "ok" };
  let baseBert = null;
  let fineTunedBert = null;

  if (!bertResult.ok) {
    bertStatus = { status: "unavailable", error: bertResult.error };
  } else {
    baseBert = normalizeBertVote(bertResult.votes?.zeroShotBert);
    fineTunedBert = normalizeBertVote(bertResult.votes?.fineTunedBert);
    if (!fineTunedBert && bertResult.fineTunedError) {
      bertStatus = {
        status: "partial",
        error: bertResult.fineTunedError,
        zeroShotOk: Boolean(baseBert),
        fineTunedOk: false,
      };
    }
  }

  const votes = {
    gptOss: {
      subject: gptOss.subject,
      confidence: gptOss.confidence,
      rationale: gptOss.rationale || "",
    },
    baseBert,
    fineTunedBert,
  };

  let orchestrator;
  try {
    orchestrator = await orchestrateWithGptOss(rawText, votes, customSubjects);
  } catch (err) {
    // Degraded: fall back to GPT-OSS vote alone
    orchestrator = {
      subject: gptOss.subject,
      confidence: gptOss.confidence,
      rationale: `Orchestrator failed (${err?.message || "error"}); using GPT-OSS vote.`,
      customSuggestion: gptOss.customSuggestion,
      model: gptOss.model,
      latencyMs: 0,
      degraded: true,
    };
  }

  return {
    subject: orchestrator.subject,
    confidence: orchestrator.confidence,
    rationale: orchestrator.rationale,
    customSuggestion: orchestrator.customSuggestion,
    model: orchestrator.model,
    latencyMs: orchestrator.latencyMs,
    votes,
    gptOss,
    orchestrator,
    bert: bertStatus,
  };
}

/**
 * Orchestrator LLM: reads note + three votes; may pick one of 8 or Other/custom.
 */
export async function orchestrateWithGptOss(rawText, votes, customSubjects = []) {
  const customList =
    Array.isArray(customSubjects) && customSubjects.length
      ? customSubjects.join(", ")
      : "(none)";

  const system = [
    "You are an orchestrator that picks the final academic subject for student notes.",
    `Fixed subjects: ${FIXED_SUBJECTS.join(", ")}.`,
    `You may also choose "${OTHER_SUBJECT}" and suggest a short custom subject name.`,
    "You receive votes from three classifiers: GPT-OSS, zero-shot BERT, and fine-tuned BERT.",
    "Prefer agreement among models; weigh fine-tuned BERT highly when confidence is strong;",
    "use Other when none of the eight fit (especially if GPT-OSS already suggested Other).",
    "Respond with a single JSON object only, no markdown.",
    'Schema: {"subject": string, "confidence": number, "rationale": string, "customSuggestion": string|null}',
    "confidence is 0..1.",
  ].join(" ");

  const user = [
    `User custom subjects: ${customList}`,
    "",
    "Votes (JSON):",
    JSON.stringify(votes, null, 2),
    "",
    "Notes:",
    rawText.slice(0, 8000),
  ].join("\n");

  const started = Date.now();
  const result = await chatCompletions({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    maxTokens: 512,
    json: true,
  });
  const latencyMs = Date.now() - started;

  const parsed = extractJsonObject(result.content) || {};
  let subject = normalizeSubjectLabel(parsed.subject) || OTHER_SUBJECT;
  if (
    subject !== OTHER_SUBJECT &&
    !FIXED_SUBJECTS.includes(subject) &&
    !customSubjects.some((c) => c.toLowerCase() === subject.toLowerCase())
  ) {
    parsed.customSuggestion = parsed.customSuggestion || subject;
    subject = OTHER_SUBJECT;
  }

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    subject,
    confidence,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    customSuggestion:
      typeof parsed.customSuggestion === "string" && parsed.customSuggestion.trim()
        ? parsed.customSuggestion.trim()
        : null,
    model: result.model,
    latencyMs,
    usage: result.usage,
  };
}

/**
 * Format raw notes into clean, readable HTML for the given subject.
 */
export async function formatNotesWithGptOss(rawText, subject) {
  const system = [
    "You turn messy student notes into clean, readable HTML fragments.",
    "Output ONLY HTML (no markdown fences, no surrounding explanation).",
    "Use semantic tags: h2/h3, p, ul/ol/li, strong, em, code, pre, blockquote when useful.",
    "Do not invent facts that are not in the notes; you may lightly reorganize and clarify.",
    `Subject context for subtle styling class: ${subject}.`,
    `Root element must be: <article class="note note--${slugify(subject)}" data-subject="${escapeAttr(subject)}">…</article>`,
  ].join(" ");

  const started = Date.now();
  const result = await chatCompletions({
    messages: [
      { role: "system", content: system },
      { role: "user", content: rawText.slice(0, 14000) },
    ],
    temperature: 0.3,
    maxTokens: 4096,
  });
  const latencyMs = Date.now() - started;

  let html = result.content.trim();
  if (html.startsWith("```")) {
    html = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "");
  }
  if (!html.includes("<article")) {
    html = `<article class="note note--${slugify(subject)}" data-subject="${escapeAttr(subject)}">${html}</article>`;
  }

  return {
    html,
    model: result.model,
    latencyMs,
    usage: result.usage,
  };
}

/**
 * Resolve final subject from orchestrator/classification + custom subjects.
 */
export function resolveSubject(classification, customSubjects = []) {
  if (!classification) {
    return { subject: OTHER_SUBJECT, createdCustom: null };
  }

  if (classification.subject !== OTHER_SUBJECT) {
    return { subject: classification.subject, createdCustom: null };
  }

  const suggestion = classification.customSuggestion;
  if (!suggestion) {
    return { subject: OTHER_SUBJECT, createdCustom: null };
  }

  const match = customSubjects.find(
    (c) => c.toLowerCase() === suggestion.toLowerCase()
  );
  if (match) {
    return { subject: match, createdCustom: null };
  }

  return { subject: suggestion, createdCustom: suggestion };
}

function slugify(label) {
  return String(label || "other")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "other";
}

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
