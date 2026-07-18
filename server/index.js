/**
 * NoteLMs Mac Studio Express API.
 * Modeled after SocketHR: JWT from Vercel, filesystem storage, LM Studio GPT-OSS.
 *
 * Port 3002 — shared Cloudflare Tunnel hostname api.notelms.com.
 */

import express from "express";
import cors from "cors";
import {
  authConfigured,
  requireAuth,
  getAuthConfig,
} from "./auth.js";
import {
  ensureUser,
  updateProfile,
  listSubjects,
  addCustomSubject,
  listNotes,
  getNote,
  createNote,
  updateNote,
  deleteNote,
  writeResearchEvent,
  listResearchEvents,
  getDataRoot,
  emailToFolderName,
} from "./storage.js";
import { probeLmStudio, chatCompletions, getLmStudioConfig } from "./lmstudio.js";
import {
  classifyWithGptOss,
  formatNotesWithGptOss,
  resolveSubject,
} from "./classify.js";

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
  const lm = await probeLmStudio();
  const { issuer, audience } = getAuthConfig();
  res.json({
    ok: true,
    service: "notelms-server",
    authConfigured: authConfigured(),
    dataDir: getDataRoot(),
    jwt: { issuer, audience },
    lmStudio: {
      ok: lm.ok,
      baseUrl: lm.baseUrl,
      model: lm.model,
      modelLoaded: lm.modelLoaded ?? false,
    },
    time: new Date().toISOString(),
  });
});

/** Ensure Google-signed-in users get a folder named by their email. */
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const { profile, subjects, root } = await ensureUser(req.user.email, {
      name: req.user.name,
    });
    res.json({
      ok: true,
      user: profile,
      subjects: {
        custom: subjects.custom || [],
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
    const subjects = await addCustomSubject(req.user.email, label);
    res.status(201).json({ ok: true, subjects });
  } catch (err) {
    const status = /invalid|already/i.test(err.message || "") ? 400 : 500;
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
    const note = await updateNote(req.user.email, req.params.noteId, {
      title: req.body?.title,
      subject: req.body?.subject,
      rawText: req.body?.rawText,
      html: req.body?.html,
      classification: req.body?.classification,
    });
    if (!note) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }
    res.json({ ok: true, note });
  } catch (err) {
    console.error("[PATCH /api/notes/:id]", err);
    res.status(500).json({ ok: false, error: err.message || "failed" });
  }
});

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

/** Classify notes with GPT-OSS only (BERT deferred). */
app.post("/api/classify", requireAuth, async (req, res) => {
  try {
    await ensureUser(req.user.email, { name: req.user.name });
    const rawText = req.body?.rawText ?? req.body?.text ?? "";
    if (typeof rawText !== "string" || !rawText.trim()) {
      res.status(400).json({ ok: false, error: "rawText required" });
      return;
    }
    const subjects = await listSubjects(req.user.email);
    const classification = await classifyWithGptOss(rawText, {
      customSubjects: subjects.custom,
    });
    const resolved = resolveSubject(classification, subjects.custom);
    res.json({
      ok: true,
      classification,
      resolved,
      bert: { status: "deferred", message: "BERT arms not enabled yet" },
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
 * Full ingest: classify (GPT-OSS) → format → save under user's email folder.
 * BERT votes are stubbed null until those arms are wired.
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
    const classification = await classifyWithGptOss(rawText, {
      customSubjects: subjects.custom,
    });
    const resolved = resolveSubject(classification, subjects.custom);

    if (resolved.createdCustom) {
      await addCustomSubject(req.user.email, resolved.createdCustom);
    }

    const formatted = await formatNotesWithGptOss(rawText, resolved.subject);

    const research = await writeResearchEvent(req.user.email, {
      kind: "classify_ingest",
      textPreview: rawText.slice(0, 500),
      textLength: rawText.length,
      votes: classification.votes,
      gptOss: {
        subject: classification.subject,
        confidence: classification.confidence,
        rationale: classification.rationale,
        model: classification.model,
        latencyMs: classification.latencyMs,
      },
      finalSubject: resolved.subject,
      createdCustom: resolved.createdCustom,
      formatLatencyMs: formatted.latencyMs,
      formatModel: formatted.model,
      bert: { status: "deferred" },
    });

    const note = await createNote(req.user.email, {
      rawText,
      html: formatted.html,
      title: req.body?.title,
      subject: resolved.subject,
      source: req.body?.source || "paste",
      classification: {
        subject: classification.subject,
        confidence: classification.confidence,
        rationale: classification.rationale,
        model: classification.model,
        resolvedSubject: resolved.subject,
      },
      researchEventId: research.id,
    });

    res.status(201).json({
      ok: true,
      note,
      classification,
      resolved,
      researchEventId: research.id,
      bert: { status: "deferred" },
    });
  } catch (err) {
    console.error("[/api/notes/ingest]", err);
    res.status(502).json({ ok: false, error: err.message || "ingest failed" });
  }
});

/** Free-form chat against GPT-OSS (optional helper for the product UI). */
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
          ["system", "user", "assistant"].includes(m.role)
      )
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 16000) }));

    if (!safe.length) {
      res.status(400).json({ ok: false, error: "no valid messages" });
      return;
    }

    const result = await chatCompletions({
      messages: safe,
      temperature: typeof req.body?.temperature === "number" ? req.body.temperature : 0.4,
      maxTokens: typeof req.body?.maxTokens === "number" ? req.body.maxTokens : 2048,
    });
    res.json({
      ok: true,
      content: result.content,
      model: result.model,
      usage: result.usage,
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

app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ ok: false, error: "internal error" });
});

app.listen(PORT, HOST, () => {
  console.log(
    `[notelms-server] listening on http://${HOST}:${PORT} dataDir=${getDataRoot()} auth=${authConfigured()} model=${getLmStudioConfig().model}`
  );
});
