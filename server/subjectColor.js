/**
 * Accent colors for subjects (defaults + GPT-OSS pick for custom labels).
 */

import { chatCompletions } from "./lmstudio.js";
import { extractJsonObject } from "./classify.js";
import { FIXED_SUBJECTS } from "./subjects.js";

/** Legacy gray used when unset; prefer hashSubjectAccent for new failures. */
export const CUSTOM_SUBJECT_COLOR_FALLBACK = "#64748b";

/** Canonical accents for the eight fixed taxonomy subjects. */
export const FIXED_SUBJECT_COLORS = {
  Mathematics: "#2563eb",
  Physics: "#4f46e5",
  Chemistry: "#d97706",
  Biology: "#059669",
  "Computer Science": "#0891b2",
  History: "#a16207",
  Literature: "#be123c",
  Economics: "#0d9488",
};

const COLOR_PICK_ATTEMPTS = 3;
const COLOR_PICK_TIMEOUT_MS = 20_000;
const COLOR_PICK_MAX_TOKENS = 512;

function clampChannel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbToHex(r, g, b) {
  const to = (n) => n.toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function normalizeHex(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return s.toLowerCase();
}

function hexToRgb(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/**
 * Deterministic vibrant accent from a subject label (no LLM).
 * Used when LM Studio fails or returns a washed/gray color.
 */
export function hashSubjectAccent(label) {
  const name = String(label || "").trim().toLowerCase() || "subject";
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  const { r, g, b } = hslToRgb(hue, 0.68, 0.42);
  return rgbToHex(r, g, b);
}

/**
 * True when hex is saturated enough to read as a UI accent (not slate/gray).
 */
export function isUsableAccentColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const n = normalizeHex(hex);
  if (!n || n === CUSTOM_SUBJECT_COLOR_FALLBACK) return false;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === 0) return false;
  const lightness = (max + min) / 2;
  const hslSat =
    max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  // Reject near-neutrals and extremes that look like "no color" in the UI.
  // HSL saturation catches slate-blues like #6474b0 that HSV still rates mid.
  if (hslSat < 0.38) return false;
  if (lightness < 0.18 || lightness > 0.72) return false;
  if ((max - min) * 255 < 48) return false;
  return true;
}

/**
 * Fill in missing fixed-subject accents from FIXED_SUBJECT_COLORS.
 * Does not overwrite an existing stored color (including user overrides).
 * @param {Record<string, string>} [customColors]
 */
export function withDefaultFixedColors(customColors = {}) {
  const out = {};
  if (customColors && typeof customColors === "object") {
    for (const [label, value] of Object.entries(customColors)) {
      if (typeof label !== "string" || !label.trim()) continue;
      const hex = normalizeHex(value);
      if (!hex) continue;
      out[label.trim()] = hex;
    }
  }
  for (const name of FIXED_SUBJECTS) {
    const has = Object.keys(out).some(
      (k) => k.toLowerCase() === name.toLowerCase()
    );
    if (!has) out[name] = FIXED_SUBJECT_COLORS[name];
  }
  return out;
}

/**
 * Default hex for a fixed subject label, or null if not fixed.
 * @param {string} label
 */
export function defaultFixedSubjectColor(label) {
  const name = String(label || "").trim();
  if (!name) return null;
  const hit = FIXED_SUBJECTS.find((s) => s.toLowerCase() === name.toLowerCase());
  return hit ? FIXED_SUBJECT_COLORS[hit] : null;
}

/**
 * Merge fixed taxonomy defaults + stored profile colors.
 */
export function mergeExistingSubjectColors(customColors = {}) {
  return withDefaultFixedColors(customColors);
}

/**
 * Format existing subject accents for the color-picking prompt.
 */
export function formatExistingColorsContext(colorsByLabel) {
  const entries = Object.entries(colorsByLabel || {}).filter(
    ([name, hex]) => typeof name === "string" && typeof hex === "string"
  );
  if (!entries.length) return "";
  return entries.map(([name, hex]) => `${name}: ${hex}`).join("; ");
}

/**
 * Parse model JSON into a validated #RRGGBB, or null.
 */
export function parseSubjectColorResponse(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const r = clampChannel(parsed.r);
  const g = clampChannel(parsed.g);
  const b = clampChannel(parsed.b);
  if (r != null && g != null && b != null) {
    return rgbToHex(r, g, b);
  }
  return normalizeHex(parsed.hex);
}

/**
 * Ask GPT-OSS for a UI accent color that represents a *custom* subject label.
 * Retries on washed/gray or unparseable replies; falls back to a deterministic
 * vibrant hash (never silent slate gray). Does not throw.
 * Fixed taxonomy labels should use defaultFixedSubjectColor instead.
 *
 * @param {string} label
 * @param {{ existingColors?: Record<string, string> }} [opts]
 */
export async function pickCustomSubjectColor(
  label,
  { existingColors = {} } = {}
) {
  const name = String(label || "").trim();
  if (!name) return CUSTOM_SUBJECT_COLOR_FALLBACK;

  const fixedDefault = defaultFixedSubjectColor(name);
  if (fixedDefault) return fixedDefault;

  const colorsByLabel = mergeExistingSubjectColors(existingColors);
  const existingContext = formatExistingColorsContext(colorsByLabel);
  const fallback = hashSubjectAccent(name);

  const system = [
    "You pick a single UI accent color for a custom academic subject folder.",
    "The color should feel thematically appropriate for the subject name.",
    "Prefer saturated, mid-brightness accents suitable as a thin UI highlight",
    "(similar weight to Tailwind 600–700 hues).",
    "Hard requirement: chroma must be high — never gray, slate, silver, charcoal,",
    "beige, or any near-neutral. Saturation should be clearly colorful.",
    existingContext
      ? `These subjects already have colors — pick something visually distinct from all of them: ${existingContext}.`
      : "",
    "Respond with a single JSON object only, no markdown, no explanation.",
    'Schema: {"r": number, "g": number, "b": number, "hex": string}',
    "r, g, b are integers 0..255. hex is #RRGGBB matching those channels.",
  ]
    .filter(Boolean)
    .join(" ");

  for (let attempt = 0; attempt < COLOR_PICK_ATTEMPTS; attempt += 1) {
    try {
      const result = await chatCompletions({
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              attempt === 0
                ? `Subject name: ${name.slice(0, 200)}`
                : `Subject name: ${name.slice(0, 200)}. Previous reply was invalid or too gray — return a vivid saturated accent JSON only.`,
          },
        ],
        temperature: attempt === 0 ? 0.4 : 0.7,
        maxTokens: COLOR_PICK_MAX_TOKENS,
        json: true,
        timeoutMs: COLOR_PICK_TIMEOUT_MS,
      });

      const parsed = extractJsonObject(result.content);
      const hex = parseSubjectColorResponse(parsed);
      if (hex && isUsableAccentColor(hex)) return hex;
    } catch (err) {
      console.warn(
        `[subjectColor] pick failed for "${name}" (attempt ${attempt + 1}/${COLOR_PICK_ATTEMPTS}):`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return fallback;
}
