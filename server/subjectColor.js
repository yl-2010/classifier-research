/**
 * GPT-OSS accent color for custom subjects.
 */

import { chatCompletions } from "./lmstudio.js";
import { extractJsonObject } from "./classify.js";

/** Fallback when LM Studio is down or returns invalid RGB. */
export const CUSTOM_SUBJECT_COLOR_FALLBACK = "#64748b";

const FIXED_SUBJECT_HEXES = [
  "#2563eb", // Mathematics
  "#4f46e5", // Physics
  "#d97706", // Chemistry
  "#059669", // Biology
  "#0891b2", // Computer Science
  "#a16207", // History
  "#be123c", // Literature
  "#0d9488", // Economics
];

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
 */
export async function pickCustomSubjectColor(label, { avoidHexes = [] } = {}) {
  const name = String(label || "").trim();
  if (!name) return CUSTOM_SUBJECT_COLOR_FALLBACK;

  const avoid = [
    ...FIXED_SUBJECT_HEXES,
    ...avoidHexes.filter((h) => typeof h === "string"),
  ]
    .map((h) => h.toLowerCase())
    .filter((h, i, arr) => arr.indexOf(h) === i);

  try {
    const system = [
      "You pick a single UI accent color for a custom academic subject folder.",
      "The color should feel thematically appropriate for the subject name.",
      "Prefer saturated, mid-brightness accents suitable as a thin UI highlight",
      "(similar weight to Tailwind 600–700 hues). Avoid near-white, near-black,",
      "and gray/slate neutrals.",
      `Do not reuse these existing accents: ${avoid.join(", ")}.`,
      "Respond with a single JSON object only, no markdown.",
      'Schema: {"r": number, "g": number, "b": number, "hex": string}',
      "r, g, b are integers 0..255. hex is #RRGGBB matching those channels.",
    ].join(" ");

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
