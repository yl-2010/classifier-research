/**
 * Lexical paper retrieval for NoteLMs chat (same idea as note retrieval).
 * PDF text is cached by mtime; only top-scoring chunks are stuffed into prompts.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/** Local copies — avoid circular import with noteChatContext.js */
function tokenizeQuery(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreHaystack(tokens, haystack) {
  if (!tokens.length) return 0;
  const h = String(haystack || "").toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (h.includes(t)) score += 1;
  }
  return score;
}

export const DEFAULT_PAPER_PDF_PATH = path.join(
  REPO_ROOT,
  "web",
  "public",
  "documents",
  "paper.pdf"
);

export const MAX_PAPER_CHUNK_CHARS = 4_000;
export const MAX_RETRIEVED_PAPER_CHUNKS = 3;
export const MAX_TOTAL_RETRIEVED_PAPER_CHARS = 10_000;
export const MAX_OPEN_PAPER_CHARS = 6_000;

/** Soft cap on cached full text — current paper is ~6k chars. */
export const MAX_PAPER_TEXT_CACHE = 80_000;

/** @type {{ path: string, mtimeMs: number, text: string, chunks: string[] } | null} */
let cache = null;

/**
 * @param {string} text
 * @returns {string}
 */
function normalizePaperText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split paper into paragraph-ish chunks (keep short ones grouped).
 * @param {string} text
 * @returns {string[]}
 */
export function chunkPaperText(text) {
  const normalized = normalizePaperText(text);
  if (!normalized) return [];

  const paras = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let buf = "";
  for (const para of paras) {
    if (!buf) {
      buf = para;
      continue;
    }
    if (buf.length + 2 + para.length <= MAX_PAPER_CHUNK_CHARS) {
      buf = `${buf}\n\n${para}`;
    } else {
      chunks.push(buf);
      buf = para;
    }
  }
  if (buf) chunks.push(buf);

  // Hard-split any oversized leftover paragraphs.
  const out = [];
  for (const c of chunks) {
    if (c.length <= MAX_PAPER_CHUNK_CHARS) {
      out.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += MAX_PAPER_CHUNK_CHARS) {
      out.push(c.slice(i, i + MAX_PAPER_CHUNK_CHARS));
    }
  }
  return out;
}

/**
 * @param {string} [pdfPath]
 * @returns {Promise<{ text: string, chunks: string[] }>}
 */
export async function loadPaperDocument(pdfPath = DEFAULT_PAPER_PDF_PATH) {
  const resolved = path.resolve(pdfPath);
  const st = await fs.stat(resolved);
  if (cache && cache.path === resolved && cache.mtimeMs === st.mtimeMs) {
    return { text: cache.text, chunks: cache.chunks };
  }

  const buf = await fs.readFile(resolved);
  const data = await pdfParse(buf);
  let text = normalizePaperText(data?.text || "");
  if (!text) {
    throw new Error(`paper PDF produced empty text: ${resolved}`);
  }
  if (text.length > MAX_PAPER_TEXT_CACHE) {
    text = `${text.slice(0, MAX_PAPER_TEXT_CACHE)}\n...[truncated]`;
  }

  const chunks = chunkPaperText(text);
  cache = { path: resolved, mtimeMs: st.mtimeMs, text, chunks };
  return { text, chunks };
}

/** @deprecated use loadPaperDocument */
export async function loadPaperText(pdfPath = DEFAULT_PAPER_PDF_PATH) {
  const { text } = await loadPaperDocument(pdfPath);
  return text;
}

/**
 * True when the user is looking at the Paper page or clearly asking about it.
 * @param {string} query
 * @param {Record<string, unknown> | null | undefined} uiContext
 */
export function shouldRetrievePaper(query, uiContext) {
  const page = String(uiContext?.page || "");
  if (page === "paper") return true;
  const q = String(query || "").toLowerCase();
  if (!q.trim()) return false;
  return /\b(paper|abstract|pdf|manuscript|methods?|results?|references?|citation|yan levin|notelms:)\b/.test(
    q
  );
}

/**
 * Lexical retrieve top paper chunks for a query.
 * @param {string} query
 * @param {{
 *   uiContext?: Record<string, unknown> | null,
 *   pdfPath?: string,
 * }} [opts]
 * @returns {Promise<{
 *   openPaperText: string,
 *   retrievedChunks: Array<{ index: number, score: number, text: string }>,
 * }>}
 */
export async function retrievePaperForChat(query, opts = {}) {
  const uiContext = opts.uiContext || {};
  const page = String(uiContext.page || "");
  const wantPaper = shouldRetrievePaper(query, uiContext);

  if (!wantPaper) {
    return { openPaperText: "", retrievedChunks: [] };
  }

  const { text, chunks } = await loadPaperDocument(opts.pdfPath);
  const tokens = tokenizeQuery(query);

  // On the Paper page, mirror OPEN NOTE: lead with the start of the paper.
  const openPaperText =
    page === "paper" ? text.slice(0, MAX_OPEN_PAPER_CHARS) : "";

  const scored = chunks.map((chunk, index) => ({
    index,
    text: chunk,
    score: tokens.length ? scoreHaystack(tokens, chunk) : 0,
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  const picked = [];
  let chars = 0;
  for (const c of scored) {
    // Require a keyword hit unless we're on the paper page with a vague query.
    if (tokens.length && c.score === 0 && page !== "paper") break;
    if (tokens.length && c.score === 0 && page === "paper" && picked.length >= 1) {
      break;
    }
    if (!tokens.length && page === "paper" && picked.length >= 1) break;
    if (picked.length >= MAX_RETRIEVED_PAPER_CHUNKS) break;
    if (
      chars + c.text.length > MAX_TOTAL_RETRIEVED_PAPER_CHARS &&
      picked.length > 0
    ) {
      break;
    }
    // Skip chunks already covered by OPEN PAPER prefix when on /paper.
    if (
      openPaperText &&
      openPaperText.includes(c.text.slice(0, Math.min(120, c.text.length)))
    ) {
      continue;
    }
    picked.push(c);
    chars += c.text.length;
  }

  return { openPaperText, retrievedChunks: picked };
}

/**
 * Format paper blocks for the chat system prompt.
 * @param {{
 *   openPaperText?: string,
 *   retrievedChunks?: Array<{ index?: number, score?: number, text?: string }>,
 * }} parts
 */
export function formatPaperForChat(parts = {}) {
  const open = String(parts.openPaperText || "").trim();
  const chunks = Array.isArray(parts.retrievedChunks)
    ? parts.retrievedChunks
    : [];

  const openBlock = open
    ? `OPEN PAPER (user is on the Paper page — leading text):\n${open}`
    : "";

  let retrievedBlock;
  if (chunks.length === 0) {
    retrievedBlock = open
      ? "RETRIEVED PAPER: (none matched beyond open paper)"
      : "";
  } else {
    retrievedBlock = [
      "RETRIEVED PAPER (lexical matches from the NoteLMs research PDF):",
      ...chunks.map((c, i) => {
        const head = `${i + 1}. [chunk ${typeof c.index === "number" ? c.index : i}${
          typeof c.score === "number" ? `, score=${c.score}` : ""
        }]`;
        return `${head}\n${String(c.text || "").trim()}`;
      }),
    ].join("\n\n");
  }

  return [openBlock, retrievedBlock].filter(Boolean).join("\n\n");
}
