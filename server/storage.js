/**
 * Filesystem persistence for NoteLMs on the Mac Studio.
 *
 * Modeled after SocketHR's storage.js:
 *   DATA_ROOT comes from env, else a discovered/default path.
 *
 * Default target: <Samsung USB volume>/notelms/<email>/
 * Layout:
 *   <email>/
 *     profile.json
 *     subjects.json
 *     notes/<noteId>/…
 *     research/<eventId>.json
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { FIXED_SUBJECTS, OTHER_SUBJECT, normalizeSubjectLabel } from "./subjects.js";
import { uniquifyTitle } from "./titles.js";
import { withDefaultFixedColors } from "./subjectColor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VOLUMES_ROOT = "/Volumes";
const PREFERRED_VOLUME = "Samsung USB";
const NOTELMS_FOLDER = "notelms";

/**
 * Find the Samsung USB mount under /Volumes (name can vary slightly).
 * SocketHR uses SOCKETHR_DATA_DIR for the same idea — we auto-discover.
 */
export function findSamsungUsbVolume() {
  let entries = [];
  try {
    entries = fs.readdirSync(VOLUMES_ROOT);
  } catch {
    return null;
  }

  const usable = entries.filter((name) => {
    if (!name || name === "Macintosh HD" || name === "Recovery") return false;
    // Skip the root symlink / system volumes
    if (name.startsWith(".")) return false;
    try {
      const st = fs.statSync(path.join(VOLUMES_ROOT, name));
      return st.isDirectory();
    } catch {
      return false;
    }
  });

  const lower = (s) => s.toLowerCase();
  const exact = usable.find((n) => n === PREFERRED_VOLUME);
  if (exact) return path.join(VOLUMES_ROOT, exact);

  const samsungUsb = usable.find((n) => {
    const l = lower(n);
    return l.includes("samsung") && (l.includes("usb") || l.includes("t7") || l.includes("external"));
  });
  if (samsungUsb) return path.join(VOLUMES_ROOT, samsungUsb);

  const samsung = usable.find((n) => lower(n).includes("samsung"));
  if (samsung) return path.join(VOLUMES_ROOT, samsung);

  return null;
}

function resolveDataRoot() {
  const fromEnv = process.env.NOTELMS_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;

  const volume = findSamsungUsbVolume();
  if (volume) return path.join(volume, NOTELMS_FOLDER);

  // Canonical path the product expects when the drive is plugged in.
  return path.join(VOLUMES_ROOT, PREFERRED_VOLUME, NOTELMS_FOLDER);
}

/** Live data root (re-resolves so plugging the USB in after start still works). */
export function getDataRoot() {
  return resolveDataRoot();
}

export function getDataRootStatus() {
  const fromEnv = Boolean(process.env.NOTELMS_DATA_DIR?.trim());
  const dataRoot = getDataRoot();
  const volume = findSamsungUsbVolume();
  const volumePath = volume || path.join(VOLUMES_ROOT, PREFERRED_VOLUME);
  let volumeMounted = false;
  let dataRootExists = false;
  let writable = false;
  let error = null;

  try {
    volumeMounted = fs.existsSync(volumePath) && fs.statSync(volumePath).isDirectory();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  // Env override (tests / custom path) does not require the USB volume.
  const canUse = fromEnv || volumeMounted;

  if (canUse) {
    try {
      fs.mkdirSync(dataRoot, { recursive: true });
      const probe = path.join(dataRoot, `.write-probe-${process.pid}`);
      fs.writeFileSync(probe, "ok");
      fs.unlinkSync(probe);
      writable = true;
      dataRootExists = true;
    } catch (err) {
      writable = false;
      dataRootExists = fs.existsSync(dataRoot);
      error = err instanceof Error ? err.message : String(err);
    }
  } else {
    error =
      error ||
      `USB volume not mounted (expected under /Volumes, e.g. "/Volumes/${PREFERRED_VOLUME}")`;
  }

  return {
    dataRoot,
    volumePath,
    volumeMounted,
    dataRootExists,
    writable,
    usingEnvOverride: fromEnv,
    error,
  };
}

/**
 * Folder name = email (lowercased). Same idea as SocketHR uploader folders,
 * with a light sanitize so path-illegal characters cannot escape the data root.
 */
export function emailToFolderName(email) {
  if (typeof email !== "string") {
    throw new Error("email required");
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw new Error("invalid email");
  }
  // Mirror SocketHR sanitizeSegment — keep email-safe chars only.
  const safe = normalized
    .replace(/[^a-z0-9@._+-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  if (!safe.includes("@")) {
    throw new Error("invalid email characters");
  }
  return safe;
}

export function userDir(email) {
  return path.join(getDataRoot(), emailToFolderName(email));
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function assertDataRootReady() {
  const status = getDataRootStatus();
  if (!status.writable) {
    const err = new Error(
      status.error ||
        `NoteLMs data dir not writable: ${status.dataRoot}. Plug in the Samsung USB and run npm run server.`
    );
    err.code = "NOTELMS_DATA_UNAVAILABLE";
    err.status = 503;
    err.details = status;
    throw err;
  }
  await ensureDir(status.dataRoot);
  return status;
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fsp.rename(tmp, filePath);
}

/**
 * Ensure the per-user folder exists (named by email). Idempotent.
 * - New Google account → create folder
 * - Existing account → reuse folder; recreate if missing from disk
 */
export async function ensureUser(email, { name = null } = {}) {
  await assertDataRootReady();

  const folder = emailToFolderName(email);
  const root = userDir(folder);

  let existed = false;
  try {
    const st = await fsp.stat(root);
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
      theme: "system",
      subjectColors: {},
    };
    await writeJson(profilePath, profile);
  } else {
    profile = {
      ...profile,
      name: name || profile.name || null,
      lastSeenAt: now,
      updatedAt: now,
      theme: normalizeThemePreference(profile.theme),
      subjectColors: normalizeColorsMap(profile.subjectColors),
    };
    await writeJson(profilePath, profile);
  }

  const subjectsPath = path.join(root, "subjects.json");
  let subjects = await readJson(subjectsPath, null);
  if (!subjects) {
    subjects = { custom: [], colors: {}, updatedAt: now };
    await writeJson(subjectsPath, subjects);
  } else if (!subjects.colors || typeof subjects.colors !== "object") {
    subjects = { ...subjects, colors: {} };
  }

  // One-time migrate legacy subjects.json colors → profile.subjectColors.
  const legacyColors = normalizeColorsMap(subjects.colors);
  let subjectColors = normalizeColorsMap(profile.subjectColors);
  if (
    Object.keys(subjectColors).length === 0 &&
    Object.keys(legacyColors).length > 0
  ) {
    subjectColors = legacyColors;
  }
  // Restore canonical accents for any of the eight core subjects that are unset.
  const seeded = withDefaultFixedColors(subjectColors);
  const colorsChanged =
    JSON.stringify(seeded) !== JSON.stringify(subjectColors);
  if (colorsChanged || Object.keys(legacyColors).length > 0) {
    profile = {
      ...profile,
      subjectColors: seeded,
      updatedAt: now,
    };
    await writeJson(profilePath, profile);
  }
  if (Object.keys(legacyColors).length > 0) {
    subjects = { ...subjects, colors: {}, updatedAt: now };
    await writeJson(subjectsPath, subjects);
  }

  return {
    email: folder,
    root,
    profile,
    subjects,
    created,
    dataRoot: getDataRoot(),
  };
}

/** Normalize subjects.json / profile colors map to Record<label, #RRGGBB>. */
function normalizeColorsMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== "string" || typeof value !== "string") continue;
    const label = key.trim();
    const hex = value.trim();
    if (!label || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
    out[label] = hex.toLowerCase();
  }
  return out;
}

/** @param {unknown} raw */
export function normalizeThemePreference(raw) {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

async function writeProfileFields(email, patch = {}) {
  const { root, profile } = await ensureUser(email);
  const next = {
    ...profile,
    email: profile.email,
    theme: normalizeThemePreference(profile.theme),
    subjectColors: normalizeColorsMap(profile.subjectColors),
    updatedAt: new Date().toISOString(),
  };
  if (typeof patch.name === "string") next.name = patch.name;
  if (patch.theme !== undefined) {
    next.theme = normalizeThemePreference(patch.theme);
  }
  if (patch.subjectColors !== undefined) {
    next.subjectColors = normalizeColorsMap(patch.subjectColors);
  }
  if (typeof patch.noteCount === "number") next.noteCount = patch.noteCount;
  if (patch.lastSeenAt) next.lastSeenAt = patch.lastSeenAt;
  await writeJson(path.join(root, "profile.json"), next);
  return next;
}

export async function getProfile(email) {
  const { profile } = await ensureUser(email);
  return profile;
}

export async function updateProfile(email, patch = {}) {
  return writeProfileFields(email, patch);
}

export async function setThemePreference(email, theme) {
  if (
    theme !== "light" &&
    theme !== "dark" &&
    theme !== "system"
  ) {
    const err = new Error("invalid theme");
    err.status = 400;
    throw err;
  }
  const profile = await writeProfileFields(email, { theme });
  return { theme: profile.theme, profile };
}

export async function listSubjects(email) {
  const { subjects, profile } = await ensureUser(email);
  return {
    fixed: [...FIXED_SUBJECTS],
    other: OTHER_SUBJECT,
    custom: Array.isArray(subjects.custom) ? subjects.custom : [],
    colors: normalizeColorsMap(profile.subjectColors),
  };
}

/**
 * Add a custom subject label. Optional `color` is a #RRGGBB accent stored on the profile.
 * If the label already exists but has no color, `color` fills it in.
 */
export async function addCustomSubject(email, label, { color } = {}) {
  const normalized = normalizeSubjectLabel(label);
  if (!normalized || normalized === OTHER_SUBJECT) {
    throw new Error("invalid custom subject");
  }
  if (FIXED_SUBJECTS.includes(normalized)) {
    throw new Error("subject is already a fixed label");
  }
  const { root, subjects, profile } = await ensureUser(email);
  const custom = Array.isArray(subjects.custom) ? [...subjects.custom] : [];
  const colors = normalizeColorsMap(profile.subjectColors);
  const exists = custom.some((c) => c.toLowerCase() === normalized.toLowerCase());
  if (!exists) {
    custom.push(normalized);
    custom.sort((a, b) => a.localeCompare(b));
  }
  const existingKey = Object.keys(colors).find(
    (k) => k.toLowerCase() === normalized.toLowerCase()
  );
  const hex =
    typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color.trim())
      ? color.trim().toLowerCase()
      : null;
  if (hex) {
    if (existingKey && existingKey !== normalized) {
      delete colors[existingKey];
    }
    colors[normalized] = hex;
  }
  const nextSubjects = {
    custom,
    colors: {},
    updatedAt: new Date().toISOString(),
  };
  await writeJson(path.join(root, "subjects.json"), nextSubjects);
  await writeProfileFields(email, { subjectColors: colors });
  return { ...nextSubjects, colors };
}

/**
 * Set or overwrite the accent color for an existing subject (fixed or custom).
 * Colors are stored on profile.json (not subjects.json).
 * @param {string} email
 * @param {string} label
 * @param {string} color - #RRGGBB
 * @returns {Promise<{ label: string, color: string, subjects: Awaited<ReturnType<typeof listSubjects>> }>}
 */
export async function setSubjectColor(email, label, color) {
  const hex =
    typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color.trim())
      ? color.trim().toLowerCase()
      : null;
  if (!hex) {
    const err = new Error("invalid color");
    err.status = 400;
    throw err;
  }

  const normalized = normalizeSubjectLabel(label);
  if (!normalized || normalized === OTHER_SUBJECT) {
    const err = new Error("invalid subject");
    err.status = 400;
    throw err;
  }

  const { subjects, profile } = await ensureUser(email);
  const custom = Array.isArray(subjects.custom) ? subjects.custom : [];
  const colors = normalizeColorsMap(profile.subjectColors);

  const fixedMatch = FIXED_SUBJECTS.find(
    (s) => s.toLowerCase() === normalized.toLowerCase()
  );
  const customMatch = custom.find(
    (c) => c.toLowerCase() === normalized.toLowerCase()
  );
  const canonical = fixedMatch || customMatch || null;
  if (!canonical) {
    const err = new Error("unknown subject");
    err.status = 404;
    throw err;
  }

  for (const key of Object.keys(colors)) {
    if (key.toLowerCase() === canonical.toLowerCase() && key !== canonical) {
      delete colors[key];
    }
  }
  colors[canonical] = hex;

  await writeProfileFields(email, { subjectColors: colors });

  const listed = await listSubjects(email);
  return { label: canonical, color: hex, subjects: listed };
}

/**
 * Remove a subject from one user's library:
 * - soft-delete all notes with that subject
 * - remove each note's linked research/ event (via deleteNote)
 * - drop custom labels from subjects.json
 * - fixed taxonomy labels stay available to re-add later
 */
export async function deleteSubject(email, label) {
  const normalized = normalizeSubjectLabel(label);
  if (!normalized) {
    const err = new Error("invalid subject");
    err.status = 400;
    throw err;
  }
  if (normalized === OTHER_SUBJECT) {
    const err = new Error("cannot delete Other");
    err.status = 400;
    throw err;
  }

  await ensureUser(email);
  const notes = await listNotes(email, { subject: normalized });
  let deletedNotes = 0;
  for (const note of notes) {
    const ok = await deleteNote(email, note.id);
    if (ok) deletedNotes += 1;
  }

  let removedCustom = false;
  const isFixed = FIXED_SUBJECTS.some(
    (s) => s.toLowerCase() === normalized.toLowerCase()
  );
  if (!isFixed) {
    const { root, subjects, profile } = await ensureUser(email);
    const custom = Array.isArray(subjects.custom) ? [...subjects.custom] : [];
    const colors = normalizeColorsMap(profile.subjectColors);
    const nextCustom = custom.filter(
      (c) => c.toLowerCase() !== normalized.toLowerCase()
    );
    for (const key of Object.keys(colors)) {
      if (key.toLowerCase() === normalized.toLowerCase()) {
        delete colors[key];
      }
    }
    removedCustom = nextCustom.length !== custom.length;
    if (removedCustom) {
      await writeJson(path.join(root, "subjects.json"), {
        custom: nextCustom,
        colors: {},
        updatedAt: new Date().toISOString(),
      });
      await writeProfileFields(email, { subjectColors: colors });
    }
  }

  return {
    label: normalized,
    fixed: isFixed,
    deletedNotes,
    removedCustom,
  };
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
    entries = await fsp.readdir(notesRoot, { withFileTypes: true });
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

  // Newest upload first; full ISO includes time so same-day notes still order correctly.
  notes.sort((a, b) =>
    String(b.createdAt || b.updatedAt || "").localeCompare(
      String(a.createdAt || a.updatedAt || "")
    )
  );
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
    rawText = await fsp.readFile(paths.raw, "utf8");
  } catch {
    /* optional */
  }
  try {
    html = await fsp.readFile(paths.html, "utf8");
  } catch {
    /* optional */
  }
  return { ...meta, rawText, html };
}

export async function createNote(email, fields = {}) {
  const { root, profile } = await ensureUser(email);
  const noteId = fields.id || randomUUID();
  const now = new Date().toISOString();
  const subject = normalizeSubjectLabel(fields.subject) || OTHER_SUBJECT;
  const paths = notePaths(email, noteId);
  await ensureDir(paths.dir);

  const existing = await listNotes(email);
  const baseTitle = fields.title || deriveTitle(fields.rawText || "");
  const title = uniquifyTitle(
    baseTitle,
    existing.map((n) => n.title)
  );

  const meta = {
    id: noteId,
    title,
    subject,
    createdAt: now,
    updatedAt: now,
    source: fields.source || "paste",
    classification: fields.classification || null,
    researchEventId: fields.researchEventId || null,
    summary:
      typeof fields.summary === "string" && fields.summary.trim()
        ? fields.summary.trim()
        : null,
  };

  await writeJson(paths.meta, meta);
  if (typeof fields.rawText === "string") {
    await fsp.writeFile(paths.raw, fields.rawText, "utf8");
  }
  if (typeof fields.html === "string") {
    await fsp.writeFile(paths.html, fields.html, "utf8");
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

  // Ignore undefined so callers that pass sparse patches (e.g. subject-only)
  // do not wipe existing fields that JSON.stringify would then omit.
  const cleaned = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );

  const now = new Date().toISOString();
  const next = {
    ...meta,
    ...cleaned,
    id: meta.id,
    createdAt: meta.createdAt,
    updatedAt: now,
  };
  if (cleaned.subject != null) {
    next.subject = normalizeSubjectLabel(cleaned.subject) || meta.subject;
  }
  await writeJson(paths.meta, next);

  if (typeof cleaned.rawText === "string") {
    await fsp.writeFile(paths.raw, cleaned.rawText, "utf8");
  }
  if (typeof cleaned.html === "string") {
    await fsp.writeFile(paths.html, cleaned.html, "utf8");
  }

  return next;
}

/**
 * Soft-delete a note from the user's library (sets deletedAt) and remove
 * its linked research/ event file when researchEventId is set.
 */
export async function deleteNote(email, noteId) {
  await ensureUser(email);
  const paths = notePaths(email, noteId);
  const meta = await readJson(paths.meta, null);
  if (!meta) return false;
  if (meta.deletedAt) return true;
  const next = {
    ...meta,
    deletedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeJson(paths.meta, next);
  if (meta.researchEventId) {
    await deleteResearchEvent(email, meta.researchEventId);
  }
  return true;
}

/** Remove a research event file. Returns true if removed or already absent. */
export async function deleteResearchEvent(email, eventId) {
  await ensureUser(email);
  if (!eventId || typeof eventId !== "string") return false;
  const file = path.join(userDir(email), "research", `${eventId}.json`);
  try {
    await fsp.unlink(file);
    return true;
  } catch (err) {
    if (err && err.code === "ENOENT") return true;
    throw err;
  }
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
    entries = await fsp.readdir(dir);
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

/**
 * Patch fields on an existing research event (e.g. user subject correction).
 * Returns the updated event, or null if missing.
 */
export async function updateResearchEvent(email, eventId, patch = {}) {
  await ensureUser(email);
  if (!eventId || typeof eventId !== "string") return null;
  const file = path.join(userDir(email), "research", `${eventId}.json`);
  const existing = await readJson(file, null);
  if (!existing) return null;
  const next = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(file, next);
  return next;
}

/**
 * All research events across every user folder under the data root.
 * Used for shared research charts (frozen eval + live user tests).
 */
export async function listAllResearchEvents({ limit = 10000 } = {}) {
  await assertDataRootReady();
  const root = getDataRoot();
  let userFolders = [];
  try {
    userFolders = await fsp.readdir(root);
  } catch (err) {
    if (err && err.code === "ENOENT") return [];
    throw err;
  }

  const events = [];
  for (const folder of userFolders) {
    if (!folder.includes("@")) continue;
    const dir = path.join(root, folder, "research");
    let names = [];
    try {
      names = await fsp.readdir(dir);
    } catch (err) {
      if (err && err.code === "ENOENT") continue;
      throw err;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const ev = await readJson(path.join(dir, name), null);
      if (ev) {
        events.push({ ...ev, _userFolder: folder });
      }
    }
  }

  events.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const cap = Math.max(1, Math.min(limit, 50000));
  return events.slice(0, cap);
}

function deriveTitle(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "Untitled note";
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

// Keep REPO_ROOT referenced for SocketHR-style local fallback if needed later.
void REPO_ROOT;
