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
 * Must return one of the 8 fixed subjects (same constraint as BERT arms).
 */
export async function classifyWithGptOss(rawText) {
  const system = [
    "You classify student study notes into academic subjects.",
    `You MUST pick exactly one of these eight subjects: ${FIXED_SUBJECTS.join(", ")}.`,
    `Do not invent subjects. Do not use "${OTHER_SUBJECT}" or any custom label.`,
    "If the notes are a poor fit, still choose the closest of the eight.",
    "Respond with a single JSON object only, no markdown.",
    'Schema: {"subject": string, "confidence": number, "rationale": string}',
    "confidence is 0..1.",
  ].join(" ");

  const user = ["Notes:", rawText.slice(0, 12000)].join("\n");

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
  const subject = clampToFixedSubject(parsed.subject);

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    subject,
    confidence,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
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
    classifyWithGptOss(rawText),
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
      model: gptOss.model,
      latencyMs: 0,
      degraded: true,
    };
  }

  return {
    subject: orchestrator.subject,
    confidence: orchestrator.confidence,
    rationale: orchestrator.rationale,
    model: orchestrator.model,
    latencyMs: orchestrator.latencyMs,
    votes,
    gptOss,
    orchestrator,
    bert: bertStatus,
  };
}

/**
 * Orchestrator LLM: reads note + three votes.
 * May pick one of the 8 fixed subjects, or an existing user custom subject — never invents new ones.
 */
export async function orchestrateWithGptOss(rawText, votes, customSubjects = []) {
  const customs = Array.isArray(customSubjects)
    ? customSubjects.filter((c) => typeof c === "string" && c.trim())
    : [];
  const customList = customs.length ? customs.join(", ") : "(none)";
  const allowed = [...FIXED_SUBJECTS, ...customs];

  const system = [
    "You are an orchestrator that picks the final academic subject for student notes.",
    `The three submodels (GPT-OSS, zero-shot BERT, fine-tuned BERT) can ONLY vote among these eight: ${FIXED_SUBJECTS.join(", ")}.`,
    "Your final choice may be one of those eight, OR one of the user's existing custom subjects listed below.",
    "You must NOT invent a new subject name. Only use a custom subject if it already appears in the user's list.",
    `If none of the eight and none of the user's custom subjects fit, use "${OTHER_SUBJECT}".`,
    "Prefer agreement among the three votes; weigh fine-tuned BERT highly when its confidence is strong.",
    "Remember: a good final answer can sit outside the eight when an existing user custom subject is a better fit.",
    "Respond with a single JSON object only, no markdown.",
    'Schema: {"subject": string, "confidence": number, "rationale": string}',
    "confidence is 0..1.",
  ].join(" ");

  const user = [
    `Allowed subjects (8 fixed + user's existing customs): ${allowed.join(", ")}`,
    `User custom subjects: ${customList}`,
    "",
    "Votes from the three submodels (each limited to the eight fixed subjects) (JSON):",
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
  const subject = clampToAllowedSubject(parsed.subject, customs);

  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    subject,
    confidence,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    model: result.model,
    latencyMs,
    usage: result.usage,
  };
}

/**
 * Short study-note title from openai/gpt-oss-20b. Falls back to first-line heuristic.
 */
export async function generateTitleWithGptOss(rawText) {
  const fallback = deriveTitleFallback(rawText);
  if (!String(rawText || "").trim()) return fallback;

  try {
    const system = [
      "You create short titles for student study notes.",
      "Respond with a single JSON object only, no markdown.",
      'Schema: {"title": string}',
      "Title: 3–10 words, capture the main topic, plain text,",
      "no quotation marks, no trailing punctuation.",
    ].join(" ");

    const result = await chatCompletions({
      messages: [
        { role: "system", content: system },
        { role: "user", content: String(rawText).slice(0, 8000) },
      ],
      temperature: 0.2,
      maxTokens: 128,
      json: true,
    });

    const parsed = extractJsonObject(result.content) || {};
    let title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    title = title.replace(/^["'“”]+|["'“”]+$/g, "").replace(/[.!?]+$/g, "").trim();
    if (!title) return fallback;
    if (title.length > 80) title = `${title.slice(0, 77)}…`;
    return title;
  } catch {
    return fallback;
  }
}

function deriveTitleFallback(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "Untitled note";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

/**
 * Format raw notes into clean, readable HTML for the given subject.
 * Faithful to source only: expand shorthand + HTML layout — never invent content.
 */
export async function formatNotesWithGptOss(rawText, subject) {
  const system = [
    "You are a faithful note formatter, not a tutor or encyclopedia.",
    "Convert the student's raw notes into clean, readable HTML. Preserve meaning exactly.",
    "HARD RULES — never violate:",
    "1. Do NOT add any information, data, facts, examples, definitions, lists of models/tools, background, or explanations that are not already present in the notes.",
    "2. Do NOT elaborate, teach, fill gaps, or expand a short phrase into a full lesson.",
    "3. You MAY only: (a) expand unambiguous abbreviations/shorthand already implied by the notes (e.g. 'NLP' → 'Natural Language Processing (NLP)' when that expansion is the clear intended meaning of the note text itself), (b) fix obvious typos, (c) reorganize structure (headings, bullets, paragraphs) for readability, (d) apply HTML formatting, (e) rewrite mathematical expressions into equivalent LaTeX (same meaning, better typesetting).",
    "4. If the notes are short or sparse, the HTML must stay short and sparse. Output roughly the same amount of content as the input.",
    "5. Every claim in the output must be traceable to words or clear shorthand in the input. When unsure whether something was in the notes, omit it.",
    "Output ONLY HTML (no markdown fences, no surrounding explanation).",
    "Use semantic tags: h2/h3, p, ul/ol/li, strong, em, code, pre, blockquote when useful.",
    "MATH: Prefer KaTeX-ready LaTeX for equations. (1) If notes already use LaTeX (\\[ \\], \\( \\), $$ or $), keep delimiters and every backslash/command exactly. (2) If notes use plain/ASCII/Unicode math (e.g. integral sqrt(r^2-x^2) dx, x^2, πr^2, Greek letters as text), convert each equation into proper LaTeX with the same meaning — use \\[...\\] for standalone/display equations (each in its own <p> or <div class=\"eq\">) and \\(...\\) for short inline math inside sentences. (3) Do not invent steps, simplify results, or add formulas that were not in the notes. (4) Do not wrap math in <code>, strip backslashes, convert LaTeX to Unicode, or invent MathML/HTML equation markup.",
    `Subject is only for the CSS class / data attribute — do not use subject knowledge to invent content: ${subject}.`,
    `Root element must be: <article class="note note--${slugify(subject)}" data-subject="${escapeAttr(subject)}">…</article>`,
  ].join(" ");

  const started = Date.now();
  const result = await chatCompletions({
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          "Format these notes into HTML. Do not add anything that is not in the notes below.",
          "",
          "--- NOTES START ---",
          rawText.slice(0, 14000),
          "--- NOTES END ---",
        ].join("\n"),
      },
    ],
    temperature: 0,
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
 * Never invents or auto-creates custom subjects.
 */
export function resolveSubject(classification, customSubjects = []) {
  if (!classification) {
    return { subject: OTHER_SUBJECT, createdCustom: null };
  }

  const customs = Array.isArray(customSubjects) ? customSubjects : [];
  const subject = clampToAllowedSubject(classification.subject, customs);
  return { subject, createdCustom: null };
}

/** Clamp a label to one of the eight fixed subjects. */
function clampToFixedSubject(raw) {
  const normalized = normalizeSubjectLabel(raw);
  if (normalized && FIXED_SUBJECTS.includes(normalized)) return normalized;
  return FIXED_SUBJECTS[0];
}

/**
 * Clamp to fixed subjects, an existing user custom, or Other.
 * Invented labels are refused (mapped to Other).
 */
function clampToAllowedSubject(raw, customSubjects = []) {
  const normalized = normalizeSubjectLabel(raw);
  if (!normalized) return OTHER_SUBJECT;
  if (FIXED_SUBJECTS.includes(normalized)) return normalized;
  const match = customSubjects.find(
    (c) => typeof c === "string" && c.toLowerCase() === normalized.toLowerCase()
  );
  if (match) return match;
  if (normalized === OTHER_SUBJECT) return OTHER_SUBJECT;
  return OTHER_SUBJECT;
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
