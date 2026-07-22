/**
 * GPT-OSS accent color for custom subjects.
 */

import { chatCompletions } from "./lmstudio.js";
import { extractJsonObject } from "./classify.js";

/** Fallback when LM Studio is down or returns invalid RGB. */
export const CUSTOM_SUBJECT_COLOR_FALLBACK = "#64748b";

/** Fixed taxonomy accents (name → #RRGGBB), same as the UI. */
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

/**
 * Merge fixed + user custom subject colors into a label → #RRGGBB map.
 */
export function mergeExistingSubjectColors(customColors = {}) {
  const out = { ...FIXED_SUBJECT_COLORS };
  if (!customColors || typeof customColors !== "object") return out;
  for (const [label, value] of Object.entries(customColors)) {
    if (typeof label !== "string" || !label.trim()) continue;
    const hex = normalizeHex(value);
    if (!hex) continue;
    out[label.trim()] = hex;
  }
  return out;
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
 * Ask GPT-OSS for a UI accent color that represents the subject label.
 * Falls back to slate gray on any failure (does not throw).
 *
 * @param {string} label
 * @param {{ existingColors?: Record<string, string> }} [opts]
 *   `existingColors` — user's custom subject accents (label → #RRGGBB).
 *   Fixed taxonomy colors are always included in the prompt context.
 */
export async function pickCustomSubjectColor(
  label,
  { existingColors = {} } = {}
) {
  const name = String(label || "").trim();
  if (!name) return CUSTOM_SUBJECT_COLOR_FALLBACK;

  const colorsByLabel = mergeExistingSubjectColors(existingColors);
  const existingContext = formatExistingColorsContext(colorsByLabel);

  try {
    const system = [
      "You pick a single UI accent color for a custom academic subject folder.",
      "The color should feel thematically appropriate for the subject name.",
      "Prefer saturated, mid-brightness accents suitable as a thin UI highlight",
      "(similar weight to Tailwind 600–700 hues).",
      "Do not choose gray or slate neutrals.",
      existingContext
        ? `These subjects already have colors — pick something visually distinct from all of them: ${existingContext}.`
        : "",
      "Respond with a single JSON object only, no markdown.",
      'Schema: {"r": number, "g": number, "b": number, "hex": string}',
      "r, g, b are integers 0..255. hex is #RRGGBB matching those channels.",
    ]
      .filter(Boolean)
      .join(" ");

    const result = await chatCompletions({
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Subject name: ${name.slice(0, 200)}` },
      ],
      temperature: 0.3,
      maxTokens: 128,
      json: true,
    });

    const parsed = extractJsonObject(result.content);
    const hex = parseSubjectColorResponse(parsed);
    if (hex && hex !== CUSTOM_SUBJECT_COLOR_FALLBACK) return hex;
    return hex || CUSTOM_SUBJECT_COLOR_FALLBACK;
  } catch {
    return CUSTOM_SUBJECT_COLOR_FALLBACK;
  }
}
