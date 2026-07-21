/**
 * Extract raw text from note images via OpenAI vision.
 * Requires OPENAI_API_KEY in server/.env (never commit the key).
 */

const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function getOpenAiConfig() {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  return {
    apiKey,
    configured: Boolean(apiKey),
    model: process.env.OPENAI_OCR_MODEL || DEFAULT_MODEL,
  };
}

/**
 * @param {string} mimeType
 * @returns {string|null}
 */
export function normalizeImageMime(mimeType) {
  const raw = String(mimeType || "")
    .trim()
    .toLowerCase()
    .split(";")[0];
  if (!raw) return null;
  if (raw === "image/jpg") return "image/jpeg";
  if (!ALLOWED_MIME.has(raw)) return null;
  return raw;
}

/**
 * @param {object} opts
 * @param {string} opts.imageBase64 - raw base64 (no data: prefix) or full data URL
 * @param {string} [opts.mimeType]
 * @returns {Promise<{ rawText: string, model: string, latencyMs: number }>}
 */
export async function extractTextFromImage({ imageBase64, mimeType } = {}) {
  const { apiKey, model, configured } = getOpenAiConfig();
  if (!configured) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to server/.env and restart the API."
    );
  }

  let b64 = String(imageBase64 || "").trim();
  let mime = normalizeImageMime(mimeType);

  if (b64.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(b64);
    if (!match) {
      throw new Error("Invalid data URL for image");
    }
    mime = normalizeImageMime(match[1]) || mime;
    b64 = match[2].replace(/\s+/g, "");
  } else {
    b64 = b64.replace(/\s+/g, "");
  }

  if (!b64) {
    throw new Error("imageBase64 required");
  }
  if (!mime) {
    throw new Error(
      "Unsupported image type. Use JPEG, PNG, WebP, or GIF."
    );
  }

  // ~20MB decoded ceiling — keeps requests practical for note photos
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > 20 * 1024 * 1024) {
    throw new Error("Image is too large (max 20MB)");
  }

  const dataUrl = `data:${mime};base64,${b64}`;
  const started = Date.now();

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Extract all readable text from this study-note image.",
                "Return only the raw transcribed text, preserving line breaks where helpful.",
                "Do not summarize, translate, categorize, or add commentary.",
                "If the image has no readable text, return an empty string.",
              ].join(" "),
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        },
      ],
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `OpenAI returned non-JSON (${res.status}): ${text.slice(0, 240)}`
    );
  }

  if (!res.ok) {
    const msg =
      data?.error?.message || data?.error || text.slice(0, 240) || res.statusText;
    throw new Error(`OpenAI OCR error ${res.status}: ${msg}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response missing choices[0].message.content");
  }

  return {
    rawText: content.trim(),
    model: data.model || model,
    latencyMs: Date.now() - started,
  };
}
