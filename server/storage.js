/**
 * Filesystem persistence for NoteLMs on the Mac Studio.
 *
 * Root (default): /Volumes/Samsung USB/notelms
 * Layout:
 *   <email>/
 *     profile.json
 *     subjects.json          # custom subjects for this user
 *     notes/<noteId>/
 *       note.json
 *       content.html         # optional formatted HTML
 *       raw.txt              # original pasted / OCR text
 *     research/<eventId>.json
 */

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { FIXED_SUBJECTS, OTHER_SUBJECT, normalizeSubjectLabel } from "./subjects.js";

const DEFAULT_DATA_DIR = "/Volumes/Samsung USB/notelms";

export function getDataRoot() {
  return process.env.NOTELMS_DATA_DIR || DEFAULT_DATA_DIR;
}

/** Email folders are lowercased so Google casing variants map to one folder. */
export function emailToFolderName(email) {
  if (typeof email !== "string") {
    throw new Error("email required");
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("invalid email");
  }
  // Block path traversal / illegal path segments.
  if (
    normalized.includes("..") ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.includes("\0")
  ) {
    throw new Error("invalid email characters");
  }
  return normalized;
}

export function userDir(email) {
  return path.join(getDataRoot(), emailToFolderName(email));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tmp, filePath);
}

/**
 * Ensure the per-user folder exists (named by email). Idempotent.
 * - New Google account → create folder
 * - Existing account → reuse folder; recreate if missing from disk
 */
export async function ensureUser(email, { name = null } = {}) {
  const folder = emailToFolderName(email);
  const root = userDir(folder);

  let existed = false;
  try {
    const st = await fs.stat(root);
    existed = st.isDirectory();
  } catch {
    existed = false;
  }

  await ensureDir(root);
  await ensureDir(path.join(root, "notes"));
  await ensureDir(path.join(root, "research"));

  const profilePath = path.join(root, "profile.json");
  let profile = await readJson(profilePath, null);
  const now = new Date().toISOString();
  const created = !existed || !profile;

  if (!profile) {
    profile = {
      email: folder,
      name: name || null,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
      noteCount: 0,
    };
    await writeJson(profilePath, profile);
  } else {
    profile = {
      ...profile,
      name: name || profile.name || null,
      lastSeenAt: now,
      updatedAt: now,
    };
    await writeJson(profilePath, profile);
  }

  const subjectsPath = path.join(root, "subjects.json");
  let subjects = await readJson(subjectsPath, null);
  if (!subjects) {
    subjects = { custom: [], updatedAt: now };
    await writeJson(subjectsPath, subjects);
  }

  return { email: folder, root, profile, subjects, created };
}

export async function getProfile(email) {
  const { profile } = await ensureUser(email);
  return profile;
}

export async function updateProfile(email, patch = {}) {
  const { root, profile } = await ensureUser(email);
  const next = {
    ...profile,
    ...patch,
    email: profile.email,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(path.join(root, "profile.json"), next);
  return next;
}

export async function listSubjects(email) {
  const { subjects } = await ensureUser(email);
  return {
    fixed: [...FIXED_SUBJECTS],
    other: OTHER_SUBJECT,
    custom: Array.isArray(subjects.custom) ? subjects.custom : [],
  };
}

export async function addCustomSubject(email, label) {
  const normalized = normalizeSubjectLabel(label);
  if (!normalized || normalized === OTHER_SUBJECT) {
    throw new Error("invalid custom subject");
  }
  if (FIXED_SUBJECTS.includes(normalized)) {
    throw new Error("subject is already a fixed label");
  }
  const { root, subjects } = await ensureUser(email);
  const custom = Array.isArray(subjects.custom) ? [...subjects.custom] : [];
  const exists = custom.some((c) => c.toLowerCase() === normalized.toLowerCase());
  if (!exists) {
    custom.push(normalized);
    custom.sort((a, b) => a.localeCompare(b));
  }
  const next = { custom, updatedAt: new Date().toISOString() };
  await writeJson(path.join(root, "subjects.json"), next);
  return next;
}

function notePaths(email, noteId) {
  const dir = path.join(userDir(email), "notes", noteId);
  return {
    dir,
    meta: path.join(dir, "note.json"),
    raw: path.join(dir, "raw.txt"),
    html: path.join(dir, "content.html"),
  };
}

export async function listNotes(email, { subject = null } = {}) {
  await ensureUser(email);
  const notesRoot = path.join(userDir(email), "notes");
  let entries = [];
  try {
    entries = await fs.readdir(notesRoot, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }

  const notes = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const meta = await readJson(path.join(notesRoot, ent.name, "note.json"), null);
    if (!meta || meta.deletedAt) continue;
    if (subject && meta.subject !== subject) continue;
    notes.push(meta);
  }

  notes.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return notes;
}

export async function getNote(email, noteId, { includeContent = true } = {}) {
  await ensureUser(email);
  const paths = notePaths(email, noteId);
  const meta = await readJson(paths.meta, null);
  if (!meta || meta.deletedAt) return null;

  if (!includeContent) return meta;

  let rawText = null;
  let html = null;
  try {
    rawText = await fs.readFile(paths.raw, "utf8");
  } catch {
    /* optional */
  }
  try {
    html = await fs.readFile(paths.html, "utf8");
  } catch {
    /* optional */
  }
  return { ...meta, rawText, html };
}

/**
 * Create a note under the user's email folder.
 * @param {string} email
 * @param {object} fields
 */
export async function createNote(email, fields = {}) {
  const { root, profile } = await ensureUser(email);
  const noteId = fields.id || randomUUID();
  const now = new Date().toISOString();
  const subject = normalizeSubjectLabel(fields.subject) || OTHER_SUBJECT;
  const paths = notePaths(email, noteId);
  await ensureDir(paths.dir);

  const meta = {
    id: noteId,
    title: fields.title || deriveTitle(fields.rawText || ""),
    subject,
    createdAt: now,
    updatedAt: now,
    source: fields.source || "paste",
    classification: fields.classification || null,
    researchEventId: fields.researchEventId || null,
  };

  await writeJson(paths.meta, meta);
  if (typeof fields.rawText === "string") {
    await fs.writeFile(paths.raw, fields.rawText, "utf8");
  }
  if (typeof fields.html === "string") {
    await fs.writeFile(paths.html, fields.html, "utf8");
  }

  await writeJson(path.join(root, "profile.json"), {
    ...profile,
    noteCount: (profile.noteCount || 0) + 1,
    updatedAt: now,
  });

  return meta;
}

export async function updateNote(email, noteId, patch = {}) {
  await ensureUser(email);
  const paths = notePaths(email, noteId);
  const meta = await readJson(paths.meta, null);
  if (!meta || meta.deletedAt) return null;

  const now = new Date().toISOString();
  const next = {
    ...meta,
    ...patch,
    id: meta.id,
    createdAt: meta.createdAt,
    updatedAt: now,
  };
  if (patch.subject != null) {
    next.subject = normalizeSubjectLabel(patch.subject) || meta.subject;
  }
  await writeJson(paths.meta, next);

  if (typeof patch.rawText === "string") {
    await fs.writeFile(paths.raw, patch.rawText, "utf8");
  }
  if (typeof patch.html === "string") {
    await fs.writeFile(paths.html, patch.html, "utf8");
  }

  return next;
}

export async function deleteNote(email, noteId) {
  await ensureUser(email);
  const paths = notePaths(email, noteId);
  const meta = await readJson(paths.meta, null);
  if (!meta) return false;
  const next = {
    ...meta,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeJson(paths.meta, next);
  return true;
}

export async function writeResearchEvent(email, event) {
  await ensureUser(email);
  const id = event.id || randomUUID();
  const now = new Date().toISOString();
  const payload = {
    id,
    createdAt: now,
    ...event,
  };
  const file = path.join(userDir(email), "research", `${id}.json`);
  await writeJson(file, payload);
  return payload;
}

export async function listResearchEvents(email, { limit = 50 } = {}) {
  await ensureUser(email);
  const dir = path.join(userDir(email), "research");
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }
  const events = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const ev = await readJson(path.join(dir, name), null);
    if (ev) events.push(ev);
  }
  events.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return events.slice(0, Math.max(1, Math.min(limit, 500)));
}

function deriveTitle(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "Untitled note";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}
