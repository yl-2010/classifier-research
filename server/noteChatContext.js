/**
 * SocketHR-style chat context for NoteLMs: lexical note retrieval + site facts.
 * No vector embeddings — score notes by keyword overlap, stuff capped text.
 */

import {
  getNote,
  listNotes,
  listSubjects,
  listResearchEvents,
  listAllResearchEvents,
  setSubjectColor,
} from "./storage.js";
import { buildResearchMetrics } from "./research-metrics.js";
import { extractJsonObject } from "./classify.js";
import {
  FIXED_SUBJECT_COLORS,
  mergeExistingSubjectColors,
  formatExistingColorsContext,
} from "./subjectColor.js";

export const MAX_NOTE_TEXT_FOR_CHAT = 24_000;
export const MAX_OPEN_NOTE_FOR_CHAT = 48_000;
export const MAX_RETRIEVED_NOTES = 5;
export const MAX_TOTAL_RETRIEVED_CHARS = 36_000;

/** Compact mirror of the About page product + technical facts. */
export const ABOUT_SITE_CONTEXT = `ABOUT NOTELMS
NoteLMs helps students organize study notes; every use also feeds a research comparison of language models.

Product:
- Categorizing notes: paste or upload an image; NoteLMs assigns a subject so the library stays organized.
- Formatting notes: raw text becomes clean structured HTML for study.
- Reading aloud: on Voice, paste text and hear it read back via Orpheus TTS.

Technical:
- Research goal: compare zero-shot BERT, fine-tuned BERT, and GPT-OSS 20B on academic subject classification.
- Eval: ~2,000 offline evals already run; live product classifications add to the research set.
- Categorization: three models vote in parallel (zero-shot BERT, fine-tuned BERT, GPT-OSS 20B); an orchestrator (GPT-OSS 20B) picks the final subject.
- Image notes: OpenAI vision extracts text, then the same classify → format → save pipeline.
- Voice: text is chunked; Orpheus 3B synthesizes speech chunk by chunk.`;

/** Compact mirror of what the Research page shows. */
export const RESEARCH_SITE_CONTEXT = `RESEARCH PAGE
The Research page charts classifier comparison metrics (accuracy / F1) across:
- User tests: live classifications from product use (when users correct subjects, gold labels improve).
- Original / frozen eval: the offline evaluation set.
Arms compared: zero-shot BERT, fine-tuned BERT, GPT-OSS, and the orchestrator final subject.
Per-class F1 is shown for the eight fixed academic subjects.`;

/**
 * @param {string} text
 * @param {number} max
 * @param {string} [suffix]
 */
export function capText(text, max, suffix = "\n...[truncated]") {
  const value = String(text || "");
  if (value.length <= max) return value;
  return `${value.slice(0, max)}${suffix}`;
}

/**
 * Tokenize a query into lowercase alphanumeric tokens (length >= 2).
 * @param {string} query
 */
export function tokenizeQuery(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Lexical score: count of query tokens found in haystack fields.
 * @param {string[]} tokens
 * @param {string} haystack
 */
export function scoreHaystack(tokens, haystack) {
  if (!tokens.length) return 0;
  const h = String(haystack || "").toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (h.includes(t)) score += 1;
  }
  return score;
}

/**
 * @param {Record<string, unknown> | null | undefined} uiContext
 */
export function formatUiContext(uiContext) {
  const ui = uiContext && typeof uiContext === "object" ? uiContext : {};
  const page = String(ui.page || "unknown");
  const lines = [`CURRENT SCREEN: ${page}`];
  if (ui.subject) lines.push(`Subject folder / filter: ${ui.subject}`);
  if (ui.noteId) lines.push(`Open note id: ${ui.noteId}`);
  if (ui.noteTitle) lines.push(`Open note title: ${ui.noteTitle}`);
  return lines.join("\n");
}

/**
 * Format research metrics for the system prompt.
 * @param {Awaited<ReturnType<typeof buildResearchMetrics>> | null} metrics
 * @param {number} userEventCount
 */
export function formatResearchMetrics(metrics, userEventCount) {
  if (!metrics || typeof metrics !== "object") {
    return `Live research metrics unavailable. User research events on file: ${userEventCount}.`;
  }
  const arms = metrics.arms || {};
  const lines = [
    `User research events (this user): ${userEventCount}`,
    `Frozen eval included: ${metrics.include_frozen_tests ? "yes" : "no"}`,
    `User tests included in chart: ${metrics.include_user_tests ? "yes" : "no"}`,
    `user_test_n (all users): ${metrics.user_test_n ?? "n/a"}`,
    `frozen_test_n: ${metrics.frozen_test_n ?? "n/a"}`,
    `source: ${metrics.source || "n/a"}`,
  ];
  for (const [key, arm] of Object.entries(arms)) {
    if (!arm || typeof arm !== "object") continue;
    const acc =
      typeof arm.accuracy === "number" ? arm.accuracy.toFixed(3) : "n/a";
    const f1 =
      typeof arm.macro_f1 === "number" ? arm.macro_f1.toFixed(3) : "n/a";
    lines.push(`${key}: n=${arm.n ?? 0}, accuracy=${acc}, macro_f1=${f1}`);
  }
  return lines.join("\n");
}

/**
 * Lexical retrieve top notes for a query (excludes an already-open note id).
 * @param {string} email
 * @param {string} query
 * @param {{ excludeNoteId?: string | null }} [opts]
 */
export async function retrieveNotesForChat(email, query, opts = {}) {
  const excludeNoteId = opts.excludeNoteId || null;
  const tokens = tokenizeQuery(query);
  const metas = await listNotes(email);
  const candidates = [];

  for (const meta of metas) {
    if (!meta?.id || meta.id === excludeNoteId) continue;
    const full = await getNote(email, meta.id, { includeContent: true });
    if (!full) continue;
    const haystack = [
      full.title,
      full.subject,
      full.summary,
      full.rawText,
    ]
      .filter(Boolean)
      .join("\n");
    const score = tokens.length
      ? scoreHaystack(tokens, haystack)
      : 0;
    candidates.push({
      id: full.id,
      title: full.title,
      subject: full.subject,
      summary: full.summary || null,
      rawText: full.rawText || "",
      score,
      updatedAt: full.updatedAt || full.createdAt || "",
    });
  }

  // Prefer keyword hits; if none, fall back to newest notes.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });

  const picked = [];
  let chars = 0;
  for (const c of candidates) {
    if (tokens.length && c.score === 0 && picked.length >= 2) break;
    if (picked.length >= MAX_RETRIEVED_NOTES) break;
    const body = capText(c.rawText, MAX_NOTE_TEXT_FOR_CHAT);
    if (chars + body.length > MAX_TOTAL_RETRIEVED_CHARS && picked.length > 0) {
      break;
    }
    picked.push({ ...c, rawText: body });
    chars += body.length;
  }
  return picked;
}

/**
 * Build SUBJECT COLORS block for the chat system prompt.
 * @param {{ custom?: string[], colors?: Record<string, string> } | null} subjects
 */
export function formatSubjectColorsForChat(subjects) {
  const custom = Array.isArray(subjects?.custom) ? subjects.custom : [];
  const colors = mergeExistingSubjectColors(subjects?.colors || {});
  for (const label of custom) {
    if (typeof label !== "string" || !label.trim()) continue;
    if (
      !Object.keys(colors).some((k) => k.toLowerCase() === label.toLowerCase())
    ) {
      colors[label] = "(unset)";
    }
  }
  const listed = formatExistingColorsContext(colors);
  const customLine =
    custom.length > 0
      ? `Custom subjects: ${custom.join(", ")}.`
      : "Custom subjects: (none).";
  return `SUBJECT COLORS (current accents for every subject the user has):
${listed}
${customLine}`;
}

/**
 * Strip a trailing JSON object from assistant prose (fenced or bare).
 * @param {string} text
 */
export function stripTrailingJsonObject(text) {
  const raw = String(text || "");
  let next = raw.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```\s*$/i, "");
  if (next !== raw) return next.trimEnd();

  const start = raw.lastIndexOf("{");
  if (start < 0) return raw.trimEnd();
  const candidate = raw.slice(start).trim();
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return raw.slice(0, start).trimEnd();
    }
  } catch {
    /* keep original */
  }
  return raw.trimEnd();
}

/**
 * Parse a set_subject_color action from model JSON (or null if not that action).
 * @param {unknown} parsed
 * @returns {{ subject: string, color: string } | null}
 */
export function parseSetSubjectColorAction(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  if (parsed.action !== "set_subject_color") return null;
  const subject =
    typeof parsed.subject === "string"
      ? parsed.subject.trim()
      : typeof parsed.label === "string"
        ? parsed.label.trim()
        : "";
  const colorRaw =
    typeof parsed.color === "string"
      ? parsed.color.trim()
      : typeof parsed.hex === "string"
        ? parsed.hex.trim()
        : "";
  if (!subject || !colorRaw) return null;
  const color = /^#[0-9a-fA-F]{6}$/.test(colorRaw)
    ? colorRaw.toLowerCase()
    : null;
  if (!color) return null;
  return { subject, color };
}

/**
 * If the assistant emitted a set_subject_color action, apply it and strip JSON.
 * @param {string} email
 * @param {string} rawContent
 */
export async function applyChatSubjectColorAction(email, rawContent) {
  const raw = String(rawContent || "");
  const parsed = extractJsonObject(raw);
  const action = parseSetSubjectColorAction(parsed);
  const stripped = stripTrailingJsonObject(raw);
  const baseContent = stripped.trim() || raw.trim() || "…";

  if (!action) {
    return { content: baseContent };
  }

  try {
    const result = await setSubjectColor(email, action.subject, action.color);
    return {
      content: baseContent,
      subjectColorUpdate: { label: result.label, color: result.color },
      subjects: result.subjects,
    };
  } catch (err) {
    const msg = err?.message || "failed to update color";
    return {
      content: [
        baseContent === "…"
          ? "I couldn't update that subject color."
          : baseContent,
        `(${msg})`,
      ].join("\n\n"),
    };
  }
}

/**
 * Build the full system prompt for NoteLMs chat.
 * @param {{
 *   uiContext?: Record<string, unknown>,
 *   openNoteText?: string,
 *   retrievedNotes?: Array<Record<string, unknown>>,
 *   researchMetricsText?: string,
 *   subjectColorsText?: string,
 * }} parts
 */
export function buildNotesChatSystemPrompt(parts = {}) {
  const uiBlock = formatUiContext(parts.uiContext);
  const openTitle = parts.uiContext?.noteTitle
    ? String(parts.uiContext.noteTitle)
    : "";
  const openText = String(parts.openNoteText || "").trim();
  const openBlock = openText
    ? `OPEN NOTE (full text — user is viewing this now)${openTitle ? `: ${openTitle}` : ""}:
${capText(openText, MAX_OPEN_NOTE_FOR_CHAT)}`
    : "OPEN NOTE: (none — user is not viewing a specific note)";

  const retrieved = Array.isArray(parts.retrievedNotes)
    ? parts.retrievedNotes
    : [];
  const retrievedBlock =
    retrieved.length === 0
      ? "RETRIEVED NOTES: (none matched)"
      : [
          "RETRIEVED NOTES (lexical matches from the user's library):",
          ...retrieved.map((n, i) => {
            const head = `${i + 1}. [${n.subject || "?"}] ${n.title || n.id}${
              n.summary ? `\nSummary: ${n.summary}` : ""
            }`;
            return `${head}\n${capText(n.rawText || "", MAX_NOTE_TEXT_FOR_CHAT)}`;
          }),
        ].join("\n\n");

  const researchLive = parts.researchMetricsText || "(metrics unavailable)";
  const subjectColorsBlock =
    parts.subjectColorsText ||
    formatSubjectColorsForChat({
      custom: [],
      colors: { ...FIXED_SUBJECT_COLORS },
    });

  return `You are NoteLMs' study assistant. Answer questions about the user's notes, the Research page metrics, and the About/product facts below. Be concise and specific.

Rules:
- Prefer evidence from OPEN NOTE, RETRIEVED NOTES, research metrics, and site facts.
- If something is not in the materials, say you do not see it. Do not invent note content.
- You may use light Markdown: **bold**, *italic*, bullet or numbered lists.
- You know which screen the user is on from CURRENT SCREEN.
- Subject accent colors: the user may ask you to change any listed subject's color to a specific color (a color name or #RRGGBB). When they do, reply briefly confirming the change, resolve the requested color to a #RRGGBB hex (use a saturated mid-brightness accent for vague names like "red"), and append a single JSON object on its own at the end of your reply with this exact schema: {"action":"set_subject_color","subject":"<exact subject label from SUBJECT COLORS>","color":"#rrggbb"}. Use the exact subject label from SUBJECT COLORS. Only recolor subjects that appear in SUBJECT COLORS; do not invent subjects. Do not emit that JSON unless the user asked to change a subject's color.

${uiBlock}

${subjectColorsBlock}

${ABOUT_SITE_CONTEXT}

${RESEARCH_SITE_CONTEXT}

LIVE RESEARCH METRICS:
${researchLive}

${openBlock}

${retrievedBlock}`;
}

/**
 * Assemble everything needed for one chat turn.
 * @param {string} email
 * @param {{
 *   messages: Array<{role: string, content: string}>,
 *   uiContext?: Record<string, unknown>,
 * }} input
 */
export async function assembleNotesChatContext(email, input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const uiContext =
    input.uiContext && typeof input.uiContext === "object"
      ? input.uiContext
      : {};

  const lastUser = [...messages]
    .reverse()
    .find((m) => m.role === "user" && typeof m.content === "string");
  const query = lastUser?.content || "";

  const openNoteId =
    typeof uiContext.noteId === "string" ? uiContext.noteId : null;

  let openNoteText =
    typeof uiContext.noteText === "string" ? uiContext.noteText : "";
  if (openNoteId) {
    const note = await getNote(email, openNoteId, { includeContent: true });
    if (note) {
      const fromDisk =
        String(note.rawText || "").trim() ||
        stripHtml(note.html || "") ||
        "";
      if (fromDisk) openNoteText = fromDisk;
      if (!uiContext.noteTitle && note.title) {
        uiContext.noteTitle = note.title;
      }
      if (!uiContext.subject && note.subject) {
        uiContext.subject = note.subject;
      }
    }
  }

  const retrievedNotes = await retrieveNotesForChat(email, query, {
    excludeNoteId: openNoteId,
  });

  let researchMetricsText = "";
  try {
    const [allEvents, userEvents] = await Promise.all([
      listAllResearchEvents({ limit: 10000 }),
      listResearchEvents(email, { limit: 500 }),
    ]);
    const metrics = await buildResearchMetrics({
      includeUser: true,
      includeFrozen: true,
      userEvents: allEvents,
    });
    researchMetricsText = formatResearchMetrics(metrics, userEvents.length);
  } catch (err) {
    researchMetricsText = `Live research metrics failed to load (${err?.message || "error"}).`;
  }

  let subjectColorsText = "";
  try {
    const subjects = await listSubjects(email);
    subjectColorsText = formatSubjectColorsForChat(subjects);
  } catch (err) {
    subjectColorsText = `SUBJECT COLORS: (unavailable: ${err?.message || "error"})`;
  }

  const system = buildNotesChatSystemPrompt({
    uiContext,
    openNoteText,
    retrievedNotes,
    researchMetricsText,
    subjectColorsText,
  });

  return { system, uiContext, retrievedNotes, openNoteText };
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
