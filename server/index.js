/**
 * NoteLMs Mac Studio Express API.
 * Modeled after SocketHR: JWT from Vercel, filesystem storage, LM Studio GPT-OSS.
 *
 * Port 3002 — shared Cloudflare Tunnel hostname api.notelms.com.
 */

import "./load-env.js";
import express from "express";
import cors from "cors";
import { Readable } from "node:stream";
import {
  authConfigured,
  requireAuth,
  getAuthConfig,
} from "./auth.js";
import { loadedAuth } from "./load-env.js";
import {
  ensureUser,
  updateProfile,
  listSubjects,
  addCustomSubject,
  deleteSubject,
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  writeResearchEvent,
  listResearchEvents,
  listAllResearchEvents,
  updateResearchEvent,
  getDataRoot,
  getDataRootStatus,
  emailToFolderName,
} from "./storage.js";
import { probeLmStudio, chatCompletions, getLmStudioConfig } from "./lmstudio.js";
import {
  classifyEnsemble,
  formatNotesWithGptOss,
  generateTitleWithGptOss,
  generateSummaryWithGptOss,
  resolveSubject,
} from "./classify.js";
import { pickCustomSubjectColor } from "./subjectColor.js";
import { assembleNotesChatContext } from "./noteChatContext.js";
import { probeBertService } from "./bert.js";
import { getTtsBaseUrl, ttsFetch } from "./voice.js";
import { buildResearchMetrics } from "./research-metrics.js";
import { normalizeSubjectLabel } from "./subjects.js";
import { extractTextFromImage, probeOpenAiOcr } from "./ocr.js";

const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || "0.0.0.0";

const DEFAULT_ORIGINS = [
  "https://notelms.com",
  "https://www.notelms.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function allowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ORIGINS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const app = express();
app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const list = allowedOrigins();
      if (list.includes(origin) || list.includes("*")) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "25mb" }));

app.get("/health", async (_req, res) => {
  const [lm, bert, openaiOcr] = await Promise.all([
    probeLmStudio(),
    probeBertService(),
    probeOpenAiOcr(),
  ]);
  const { issuer, audience } = getAuthConfig();
  const data = getDataRootStatus();
  res.json({
    ok: true,
    service: "notelms-server",
    authConfigured: authConfigured(),
    authSource: loadedAuth.source,
    dataDir: data.dataRoot,
    dataDirWritable: data.writable,
    usbVolume: data.volumePath,
    usbMounted: data.volumeMounted,
    dataDirError: data.error,
    jwt: { issuer, audience },
    lmStudio: {
      ok: lm.ok,
      baseUrl: lm.baseUrl,
      model: lm.model,
      modelLoaded: lm.modelLoaded ?? false,
    },
    bert: {
      ok: bert.ok,
      url: process.env.BERT_SERVICE_URL || "http://127.0.0.1:3003",
      zeroShotLoaded: bert.zeroShotLoaded ?? false,
      fineTunedLoaded: bert.fineTunedLoaded ?? false,
      error: bert.error || bert.fineTunedError || null,
    },
    openaiOcr: {
      configured: openaiOcr.configured,
      ok: openaiOcr.ok,
      model: openaiOcr.model,
      error: openaiOcr.error,
    },
    time: new Date().toISOString(),
  });
});

/**
 * Explicit provision endpoint — called from Vercel on every Google sign-in.
 * Creates /Volumes/Samsung USB/notelms/<email>/ if missing; no-op if present.
 */
app.post("/api/ensure-user", requireAuth, async (req, res) => {
  try {
    const name =
      (typeof req.body?.name === "string" && req.body.name) || req.user.name;
    const { profile, subjects, root, created, dataRoot } = await ensureUser(
      req.user.email,
      { name }
    );
    console.log(
      `[ensure-user] ${created ? "created" : "exists"} ${emailToFolderName(req.user.email)} -> ${root}`
    );
    res.status(created ? 201 : 200).json({
      ok: true,
      created,
      folder: emailToFolderName(req.user.email),
      dataRoot,
      path: root,
      user: profile,
      subjects: {
        custom: subjects.custom || [],
        colors:
          subjects.colors && typeof subjects.colors === "object"
            ? subjects.colors
            : {},
      },
    });
  } catch (err) {
    console.error("[/api/ensure-user]", err);
    const status = err.status || 500;
    res.status(status).json({
      ok: false,
      error: err.message || "failed",
      details: err.details || undefined,
    });
  }
});

/** Ensure Google-signed-in users get a folder named by their email. */
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const { profile, subjects, root, created } = await ensureUser(req.user.email, {
      name: req.user.name,
    });
    res.json({
      ok: true,
      created,
      user: profile,
      subjects: {
        custom: subjects.custom || [],
        colors:
          subjects.colors && typeof subjects.colors === "object"
            ? subjects.colors
            : {},
      },
      folder: emailToFolderName(req.user.email),
      dataRoot: getDataRoot(),
      path: root,
    });
  } catch (err) {
    console.error("[/api/me]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

app.patch("/api/me", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const allowed = {};
    if (typeof req.body?.name === "string") allowed.name = req.body.name;
    const profile = await updateProfile(req.user.email, allowed);
    res.json({ ok: true, user: profile });
  } catch (err) {
    console.error("[PATCH /api/me]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

app.get("/api/subjects", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const subjects = await listSubjects(req.user.email);
    res.json({ ok: true, ...subjects });
  } catch (err) {
    console.error("[/api/subjects]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

app.post("/api/subjects", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const label = req.body?.label || req.body?.subject;
    const normalized = normalizeSubjectLabel(label);
    const existing = await listSubjects(req.user.email);
    const existingKey =
      normalized &&
      Object.keys(existing.colors || {}).find(
        (k) => k.toLowerCase() === normalized.toLowerCase()
      );
    const existingColor = existingKey ? existing.colors[existingKey] : null;
    const color =
      existingColor ||
      (await pickCustomSubjectColor(label, {
        avoidHexes: Object.values(existing.colors || {}),
      }));
    await addCustomSubject(req.user.email, label, { color });
    const listed = await listSubjects(req.user.email);
    const resolvedKey = Object.keys(listed.colors || {}).find(
      (k) => k.toLowerCase() === String(normalized || "").toLowerCase()
    );
    res.status(201).json({
      ok: true,
      subjects: listed,
      color: (resolvedKey && listed.colors[resolvedKey]) || color,
    });
  } catch (err) {
    const status = /invalid|already/i.test(err.message || "") ? 400 : 500;
    res.status(status).json({ ok: false, error: err.message || "failed" });
  }
});

/** Remove a subject from this user's library (soft-deletes notes + linked research). */
app.delete("/api/subjects", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const label = req.body?.label || req.body?.subject;
    const result = await deleteSubject(req.user.email, label);
    const subjects = await listSubjects(req.user.email);
    res.json({ ok: true, ...result, subjects });
  } catch (err) {
    const status =
      err.status ||
      (/invalid|cannot delete/i.test(err.message || "") ? 400 : 500);
    console.error("[DELETE /api/subjects]", err);
    res.status(status).json({ ok: false, error: err.message || "failed" });
  }
});

app.get("/api/notes", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const subject = typeof req.query.subject === "string" ? req.query.subject : null;
    const notes = await listNotes(req.user.email, { subject });
    res.json({ ok: true, notes });
  } catch (err) {
    console.error("[/api/notes]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

app.get("/api/notes/:noteId", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const note = await getNote(req.user.email, req.params.noteId, {
      includeContent: true,
    });
    if (!note) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }
    res.json({ ok: true, note });
  } catch (err) {
    console.error("[GET /api/notes/:id]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

app.post("/api/notes", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const rawText = req.body?.rawText ?? req.body?.text ?? "";
    if (typeof rawText !== "string" || !rawText.trim()) {
      res.status(400).json({ ok: false, error: "rawText required" });
      return;
    }
    const note = await createNote(req.user.email, {
      rawText,
      title: req.body?.title,
      subject: req.body?.subject,
      html: req.body?.html,
      source: req.body?.source || "paste",
      classification: req.body?.classification || null,
    });
    res.status(201).json({ ok: true, note });
  } catch (err) {
    console.error("[POST /api/notes]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

app.patch("/api/notes/:noteId", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    // Only forward fields that were actually sent so a subject-only move
    // does not wipe title / classification with undefined.
    const patch = {};
    if (req.body?.title !== undefined) patch.title = req.body.title;
    if (req.body?.subject !== undefined) patch.subject = req.body.subject;
    if (req.body?.rawText !== undefined) patch.rawText = req.body.rawText;
    if (req.body?.html !== undefined) patch.html = req.body.html;
    if (req.body?.classification !== undefined) {
      patch.classification = req.body.classification;
    }
    const note = await updateNote(req.user.email, req.params.noteId, patch);
    if (!note) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }

    // Keep linked research event gold in sync when the user corrects subject.
    if (req.body?.subject != null && note.researchEventId) {
      const gold = normalizeSubjectLabel(note.subject);
      if (gold) {
        await updateResearchEvent(req.user.email, note.researchEventId, {
          finalSubject: gold,
          userGoldSubject: gold,
          corrected: true,
        });
      }
    }

    res.json({ ok: true, note });
  } catch (err) {
    console.error("[PATCH /api/notes/:id]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

/** Soft-delete a note from the library and remove its linked research event. */
app.delete("/api/notes/:noteId", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const ok = await deleteNote(req.user.email, req.params.noteId);
    if (!ok) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/notes/:id]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

/** Classify notes: GPT-OSS + BERT (zero-shot + fine-tuned) → orchestrator. */
app.post("/api/classify", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const rawText = req.body?.rawText ?? req.body?.text ?? "";
    if (typeof rawText !== "string" || !rawText.trim()) {
      res.status(400).json({ ok: false, error: "rawText required" });
      return;
    }
    const subjects = await listSubjects(req.user.email);
    const classification = await classifyEnsemble(rawText, {
      customSubjects: subjects.custom,
    });
    const resolved = resolveSubject(classification, subjects.custom);
    res.json({
      ok: true,
      classification,
      resolved,
      votes: classification.votes,
      bert: classification.bert,
      orchestrator: classification.orchestrator,
    });
  } catch (err) {
    console.error("[/api/classify]", err);
    res.status(502).json({ ok: false, error: err.message || "classify failed" });
  }
});

/** Format raw notes to HTML via GPT-OSS. */
app.post("/api/format", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const rawText = req.body?.rawText ?? req.body?.text ?? "";
    const subject = req.body?.subject || "Other";
    if (typeof rawText !== "string" || !rawText.trim()) {
      res.status(400).json({ ok: false, error: "rawText required" });
      return;
    }
    const formatted = await formatNotesWithGptOss(rawText, subject);
    res.json({ ok: true, ...formatted, subject });
  } catch (err) {
    console.error("[/api/format]", err);
    res.status(502).json({ ok: false, error: err.message || "format failed" });
  }
});

/**
 * OCR a note photo/scan via OpenAI vision → raw text for the usual ingest pipeline.
 */
app.post("/api/notes/ocr", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const imageBase64 = req.body?.imageBase64 ?? req.body?.image ?? "";
    const mimeType = req.body?.mimeType ?? req.body?.contentType ?? "";
    const result = await extractTextFromImage({ imageBase64, mimeType });
    if (!result.rawText) {
      res.status(422).json({
        ok: false,
        error: "No readable text found in that image",
      });
      return;
    }
    res.json({
      ok: true,
      rawText: result.rawText,
      model: result.model,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    console.error("[/api/notes/ocr]", err);
    const msg = err.message || "OCR failed";
    const status = /OPENAI_API_KEY is not set/i.test(msg)
      ? 503
      : /Unsupported image|too large|required|Invalid data/i.test(msg)
        ? 400
        : 502;
    res.status(status).json({ ok: false, error: msg });
  }
});

/**
 * Full ingest: ensemble classify → format → save under user's email folder.
 */
app.post("/api/notes/ingest", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const rawText = req.body?.rawText ?? req.body?.text ?? "";
    if (typeof rawText !== "string" || !rawText.trim()) {
      res.status(400).json({ ok: false, error: "rawText required" });
      return;
    }

    const subjects = await listSubjects(req.user.email);
    const classification = await classifyEnsemble(rawText, {
      customSubjects: subjects.custom,
    });
    const resolved = resolveSubject(classification, subjects.custom);

    const [formatted, title, summary] = await Promise.all([
      formatNotesWithGptOss(rawText, resolved.subject),
      generateTitleWithGptOss(rawText),
      generateSummaryWithGptOss(rawText),
    ]);

    const research = await writeResearchEvent(req.user.email, {
      kind: "classify_ingest",
      textPreview: rawText.slice(0, 500),
      textLength: rawText.length,
      votes: classification.votes,
      gptOss: {
        subject: classification.gptOss?.subject,
        confidence: classification.gptOss?.confidence,
        rationale: classification.gptOss?.rationale,
        model: classification.gptOss?.model,
        latencyMs: classification.gptOss?.latencyMs,
      },
      orchestrator: {
        subject: classification.orchestrator?.subject,
        confidence: classification.orchestrator?.confidence,
        rationale: classification.orchestrator?.rationale,
        model: classification.orchestrator?.model,
        latencyMs: classification.orchestrator?.latencyMs,
        degraded: classification.orchestrator?.degraded || false,
      },
      finalSubject: resolved.subject,
      createdCustom: resolved.createdCustom,
      formatLatencyMs: formatted.latencyMs,
      formatModel: formatted.model,
      title,
      bert: classification.bert,
    });

    const note = await createNote(req.user.email, {
      rawText,
      html: formatted.html,
      title,
      summary,
      subject: resolved.subject,
      source: req.body?.source || "paste",
      classification: {
        subject: classification.subject,
        confidence: classification.confidence,
        rationale: classification.rationale,
        model: classification.model,
        resolvedSubject: resolved.subject,
        votes: classification.votes,
      },
      researchEventId: research.id,
    });

    res.status(201).json({
      ok: true,
      note: { ...note, html: formatted.html, summary },
      classification,
      resolved,
      votes: classification.votes,
      researchEventId: research.id,
      bert: classification.bert,
      orchestrator: classification.orchestrator,
    });
  } catch (err) {
    console.error("[/api/notes/ingest]", err);
    res.status(502).json({ ok: false, error: err.message || "ingest failed" });
  }
});

/** Free-form chat against GPT-OSS with note/site context (SocketHR-style). */
app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ ok: false, error: "messages required" });
      return;
    }
    const safe = messages
      .filter(
        (m) =>
          m &&
          typeof m.role === "string" &&
          typeof m.content === "string" &&
          ["user", "assistant"].includes(m.role)
      )
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 16000) }));

    if (!safe.length) {
      res.status(400).json({ ok: false, error: "no valid messages" });
      return;
    }

    const uiContext =
      req.body?.uiContext && typeof req.body.uiContext === "object"
        ? req.body.uiContext
        : {};

    const { system, retrievedNotes } = await assembleNotesChatContext(
      req.user.email,
      { messages: safe, uiContext }
    );

    const result = await chatCompletions({
      messages: [{ role: "system", content: system }, ...safe],
      temperature:
        typeof req.body?.temperature === "number" ? req.body.temperature : 0.4,
      maxTokens:
        typeof req.body?.maxTokens === "number" ? req.body.maxTokens : 2048,
    });
    res.json({
      ok: true,
      content: result.content,
      model: result.model,
      usage: result.usage,
      retrievedNoteIds: retrievedNotes.map((n) => n.id),
      lmStudio: getLmStudioConfig(),
    });
  } catch (err) {
    console.error("[/api/chat]", err);
    res.status(502).json({ ok: false, error: err.message || "chat failed" });
  }
});

app.get("/api/research", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const limit = Number(req.query.limit || 50);
    const events = await listResearchEvents(req.user.email, { limit });
    res.json({ ok: true, events });
  } catch (err) {
    console.error("[/api/research]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

/**
 * Shared research chart metrics (public).
 * ?includeUser=1 / ?includeFrozen=0|1 select which pools to chart.
 * At least one must be on (server forces frozen if both are off).
 * User events are always loaded so user_test_n is available for UI captions.
 * Test accounts excluded in storage.
 */
app.get("/api/research/metrics", async (req, res) => {
  try {
    const includeUser =
      req.query.includeUser === "1" ||
      req.query.includeUser === "true" ||
      req.query.include_user === "1";

    const frozenParam =
      req.query.includeFrozen ??
      req.query.include_frozen ??
      req.query.includeEval ??
      req.query.include_eval;
    // Default frozen on unless explicitly turned off.
    const includeFrozen = !(
      frozenParam === "0" || frozenParam === "false"
    );

    const userEvents = await listAllResearchEvents({ limit: 10000 });

    const metrics = await buildResearchMetrics({
      includeFrozen,
      includeUser,
      userEvents,
    });
    res.json({ ok: true, ...metrics });
  } catch (err) {
    console.error("[/api/research/metrics]", err);
    const status = err?.status || 500;
    res.status(status).json({ ok: false, error: err.message || "failed" });
  }
});

/**
 * Voice (Orpheus TTS) — ephemeral; does not touch notes/USB storage.
 * Proxies to the local Python sidecar; LM Studio stays on 127.0.0.1.
 */
app.get("/api/voice/health", requireAuth, async (_req, res) => {
  try {
    const upstream = await ttsFetch("/api/health", { timeoutMs: 8000 });
    const data = await upstream.json();
    res.status(upstream.status).json({
      ...data,
      ttsUrl: getTtsBaseUrl(),
    });
  } catch (err) {
    console.error("[/api/voice/health]", err);
    res.status(502).json({
      server: "error",
      ttsUrl: getTtsBaseUrl(),
      error: err instanceof Error ? err.message : String(err),
      lm_studio: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      voices: ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"],
      default_voice: "dan",
    });
  }
});

app.post("/api/voice/synthesize/stream", requireAuth, async (req, res) => {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  req.on("close", onClose);

  try {
    const upstream = await ttsFetch("/api/synthesize/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      timeoutMs: 0,
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text.slice(0, 240) || upstream.statusText };
      }
      return res.status(upstream.status).json(payload);
    }

    if (!upstream.body) {
      return res.status(502).json({ error: "Empty TTS stream" });
    }

    res.status(upstream.status);
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/x-ndjson"
    );
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on("error", (err) => {
      console.error("[/api/voice/synthesize/stream] pipe", err);
      if (!res.headersSent) {
        res.status(502).json({ error: err.message || "TTS stream failed" });
      } else {
        res.destroy(err);
      }
    });
    nodeStream.pipe(res);
  } catch (err) {
    if (controller.signal.aborted) return;
    console.error("[/api/voice/synthesize/stream]", err);
    if (!res.headersSent) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "TTS stream failed",
      });
    }
  } finally {
    req.off("close", onClose);
  }
});

app.post("/api/voice/synthesize", requireAuth, async (req, res) => {
  try {
    const upstream = await ttsFetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
      timeoutMs: 600_000,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { error: text.slice(0, 240) || upstream.statusText };
      }
      return res.status(upstream.status).json(payload);
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(200);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", "inline; filename=speech.wav");
    res.send(buf);
  } catch (err) {
    console.error("[/api/voice/synthesize]", err);
    res.status(502).json({
      error: err instanceof Error ? err.message : "TTS synthesize failed",
    });
  }
});

app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ ok: false, error: "internal error" });
});

app.listen(PORT, HOST, () => {
  const data = getDataRootStatus();
  console.log(
    `[notelms-server] listening on http://${HOST}:${PORT} dataDir=${data.dataRoot} usbMounted=${data.volumeMounted} writable=${data.writable} auth=${authConfigured()} authSource=${loadedAuth.source} model=${getLmStudioConfig().model}`
  );
  if (!data.writable) {
    console.warn(`[notelms-server] WARNING: ${data.error}`);
  }
});
