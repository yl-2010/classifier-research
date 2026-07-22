import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ensureUser,
  createNote,
  updateNote,
  deleteNote,
  listNotes,
  getNote,
  emailToFolderName,
  addCustomSubject,
  setSubjectColor,
  setThemePreference,
  listSubjects,
  getProfile,
  deleteSubject,
  listResearchEvents,
  listAllResearchEvents,
  updateResearchEvent,
  writeResearchEvent,
} from "../storage.js";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notelms-test-"));
process.env.NOTELMS_DATA_DIR = tmpRoot;

describe("storage", () => {
  after(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("normalizes email folder names", () => {
    assert.equal(emailToFolderName("User@Example.COM"), "user@example.com");
  });

  it("creates a user folder named by email", async () => {
    const first = await ensureUser("Alice@Example.com", {
      name: "Alice",
    });
    assert.equal(first.profile.email, "alice@example.com");
    assert.equal(path.basename(first.root), "alice@example.com");
    assert.equal(first.created, true);
    const st = await fs.stat(first.root);
    assert.ok(st.isDirectory());

    const again = await ensureUser("alice@example.com", { name: "Alice" });
    assert.equal(again.created, false);
  });

  it("does not duplicate folders for mixed-case email", async () => {
    await ensureUser("bob@example.com");
    await ensureUser("Bob@Example.com");
    const entries = await fs.readdir(tmpRoot);
    assert.equal(entries.filter((e) => e.includes("bob@")).length, 1);
  });

  it("recreates a missing folder for an existing account email", async () => {
    const email = "recreate@example.com";
    const first = await ensureUser(email);
    assert.equal(first.created, true);
    await fs.rm(first.root, { recursive: true, force: true });
    const again = await ensureUser(email, { name: "Back" });
    assert.equal(again.created, true);
    const st = await fs.stat(again.root);
    assert.ok(st.isDirectory());
  });

  it("handles concurrent ensureUser writes without ENOENT", async () => {
    const email = "concurrent@example.com";
    const results = await Promise.all(
      Array.from({ length: 20 }, () => ensureUser(email, { name: "Concurrent" }))
    );
    assert.equal(results.length, 20);
    for (const result of results) {
      assert.equal(result.profile.email, email);
    }
    const profilePath = path.join(tmpRoot, email, "profile.json");
    const raw = await fs.readFile(profilePath, "utf8");
    const profile = JSON.parse(raw);
    assert.equal(profile.email, email);
    assert.equal(profile.name, "Concurrent");
  });

  it("stores notes under the user folder", async () => {
    const email = "notes@example.com";
    await ensureUser(email);
    const meta = await createNote(email, {
      rawText: "Derivatives of polynomials\nf'(x)=nx^{n-1}",
      subject: "Mathematics",
    });
    assert.ok(meta.id);
    const listed = await listNotes(email);
    assert.equal(listed.length, 1);
    const full = await getNote(email, meta.id);
    assert.match(full.rawText, /Derivatives/);
    assert.equal(full.subject, "Mathematics");
  });

  it("supports custom subjects", async () => {
    const email = "custom@example.com";
    await ensureUser(email);
    await addCustomSubject(email, "APUSH");
    const subjects = await listSubjects(email);
    assert.ok(subjects.custom.includes("APUSH"));
    assert.deepEqual(subjects.colors, {});
  });

  it("persists and clears custom subject accent colors", async () => {
    const email = "colors@example.com";
    await ensureUser(email);
    await addCustomSubject(email, "APUSH", { color: "#c45c26" });
    let subjects = await listSubjects(email);
    assert.ok(subjects.custom.includes("APUSH"));
    assert.equal(subjects.colors.APUSH, "#c45c26");

    // Re-add without color keeps existing accent.
    await addCustomSubject(email, "APUSH");
    subjects = await listSubjects(email);
    assert.equal(subjects.colors.APUSH, "#c45c26");

    // Fill color for a label that lacked one.
    await addCustomSubject(email, "Latin");
    await addCustomSubject(email, "Latin", { color: "#7c3aed" });
    subjects = await listSubjects(email);
    assert.equal(subjects.colors.Latin, "#7c3aed");

    const result = await deleteSubject(email, "APUSH");
    assert.equal(result.removedCustom, true);
    subjects = await listSubjects(email);
    assert.equal(subjects.custom.includes("APUSH"), false);
    assert.equal(subjects.colors.APUSH, undefined);
    assert.equal(subjects.colors.Latin, "#7c3aed");
  });

  it("setSubjectColor updates custom and fixed accents", async () => {
    const email = "recolor@example.com";
    await ensureUser(email);
    await addCustomSubject(email, "APUSH", { color: "#c45c26" });

    const custom = await setSubjectColor(email, "apush", "#112233");
    assert.equal(custom.label, "APUSH");
    assert.equal(custom.color, "#112233");
    assert.equal(custom.subjects.colors.APUSH, "#112233");

    const profile = await getProfile(email);
    assert.equal(profile.subjectColors.APUSH, "#112233");

    const fixed = await setSubjectColor(email, "Biology", "#FF0000");
    assert.equal(fixed.label, "Biology");
    assert.equal(fixed.color, "#ff0000");
    assert.equal(fixed.subjects.colors.Biology, "#ff0000");
    assert.equal(fixed.subjects.custom.includes("Biology"), false);

    await assert.rejects(
      () => setSubjectColor(email, "NotASubject", "#abcdef"),
      /unknown subject/
    );
    await assert.rejects(
      () => setSubjectColor(email, "Biology", "red"),
      /invalid color/
    );
  });

  it("stores theme on the profile", async () => {
    const email = "theme@example.com";
    await ensureUser(email);
    let profile = await getProfile(email);
    assert.equal(profile.theme, "system");

    const dark = await setThemePreference(email, "dark");
    assert.equal(dark.theme, "dark");
    profile = await getProfile(email);
    assert.equal(profile.theme, "dark");

    await setThemePreference(email, "light");
    profile = await getProfile(email);
    assert.equal(profile.theme, "light");

    await assert.rejects(
      () => setThemePreference(email, "blue"),
      /invalid theme/
    );
  });

  it("migrates legacy subjects.json colors into the profile", async () => {
    const email = "migrate-colors@example.com";
    const { root } = await ensureUser(email);
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.writeFile(
      path.join(root, "subjects.json"),
      JSON.stringify({
        custom: ["Latin"],
        colors: { Latin: "#7c3aed" },
        updatedAt: new Date().toISOString(),
      }),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, "profile.json"),
      JSON.stringify({
        email,
        theme: "system",
        subjectColors: {},
        noteCount: 0,
      }),
      "utf8"
    );

    const subjects = await listSubjects(email);
    assert.equal(subjects.colors.Latin, "#7c3aed");
    const profile = await getProfile(email);
    assert.equal(profile.subjectColors.Latin, "#7c3aed");
    const rawSubjects = JSON.parse(
      await fs.readFile(path.join(root, "subjects.json"), "utf8")
    );
    assert.deepEqual(rawSubjects.colors, {});
  });

  it("preserves title and classification when only subject is patched", async () => {
    const email = "move-subject@example.com";
    await ensureUser(email);
    await addCustomSubject(email, "APUSH");
    const classification = {
      subject: "History",
      resolvedSubject: "History",
      votes: {
        gptOss: { subject: "History", confidence: 0.9 },
        baseBert: { subject: "History", confidence: 0.8 },
        fineTunedBert: { subject: "History", confidence: 0.85 },
      },
    };
    const note = await createNote(email, {
      title: "Industrial Revolution",
      rawText: "Causes of the Industrial Revolution",
      subject: "History",
      classification,
    });

    // Mimic a subject-only move that previously forwarded title: undefined.
    const updated = await updateNote(email, note.id, {
      title: undefined,
      subject: "APUSH",
      rawText: undefined,
      html: undefined,
      classification: undefined,
    });
    assert.equal(updated.title, "Industrial Revolution");
    assert.equal(updated.subject, "APUSH");
    assert.deepEqual(updated.classification, classification);

    const reloaded = await getNote(email, note.id);
    assert.equal(reloaded.title, "Industrial Revolution");
    assert.equal(reloaded.subject, "APUSH");
    assert.deepEqual(reloaded.classification, classification);
  });

  it("soft-deletes a note and removes its linked research event", async () => {
    const email = "delete-note@example.com";
    await ensureUser(email);
    const note = await createNote(email, {
      rawText: "Photosynthesis steps",
      subject: "Biology",
      researchEventId: "evt-keep",
    });
    await writeResearchEvent(email, {
      id: "evt-keep",
      kind: "classify_ingest",
      finalSubject: "Biology",
      textPreview: "Photosynthesis steps",
      votes: {
        gptOss: { subject: "Biology", confidence: 0.9 },
        baseBert: { subject: "Biology", confidence: 0.8 },
        fineTunedBert: { subject: "Biology", confidence: 0.85 },
      },
    });
    await writeResearchEvent(email, {
      id: "evt-other",
      kind: "classify_ingest",
      finalSubject: "Physics",
      textPreview: "Unrelated",
    });

    const ok = await deleteNote(email, note.id);
    assert.equal(ok, true);
    assert.equal(await getNote(email, note.id), null);
    assert.equal((await listNotes(email)).length, 0);

    const events = await listResearchEvents(email);
    assert.equal(events.length, 1);
    assert.equal(events[0].id, "evt-other");
  });

  it("deletes a subject and removes research events for its notes", async () => {
    const email = "delete-subj@example.com";
    await ensureUser(email);
    await addCustomSubject(email, "APUSH");
    const noteA = await createNote(email, {
      rawText: "Cold War outline",
      subject: "APUSH",
      researchEventId: "evt-apush",
    });
    const noteB = await createNote(email, {
      rawText: "Derivatives",
      subject: "Mathematics",
      researchEventId: "evt-math",
    });
    await writeResearchEvent(email, {
      id: "evt-apush",
      kind: "classify_ingest",
      finalSubject: "APUSH",
      textPreview: "Cold War outline",
    });
    await writeResearchEvent(email, {
      id: "evt-math",
      kind: "classify_ingest",
      finalSubject: "Mathematics",
      textPreview: "Derivatives",
    });

    const result = await deleteSubject(email, "APUSH");
    assert.equal(result.label, "APUSH");
    assert.equal(result.fixed, false);
    assert.equal(result.deletedNotes, 1);
    assert.equal(result.removedCustom, true);

    const subjects = await listSubjects(email);
    assert.equal(subjects.custom.includes("APUSH"), false);
    assert.deepEqual(
      (await listNotes(email)).map((n) => n.id).sort(),
      [noteB.id]
    );
    assert.equal(await getNote(email, noteA.id), null);

    const events = await listResearchEvents(email);
    assert.equal(events.length, 1);
    assert.equal(events[0].id, "evt-math");
  });

  it("soft-deletes notes for a fixed subject so it can be re-added later", async () => {
    const email = "delete-fixed@example.com";
    await ensureUser(email);
    await createNote(email, {
      rawText: "Newton laws",
      subject: "Physics",
    });
    await createNote(email, {
      rawText: "Cells",
      subject: "Biology",
    });

    const result = await deleteSubject(email, "Physics");
    assert.equal(result.fixed, true);
    assert.equal(result.deletedNotes, 1);
    assert.equal(result.removedCustom, false);

    const subjects = await listSubjects(email);
    assert.ok(subjects.fixed.includes("Physics"));
    assert.equal((await listNotes(email)).length, 1);
    assert.equal((await listNotes(email))[0].subject, "Biology");
  });

  it("lists research events across users and patches gold on correction", async () => {
    const a = "chart-a@example.com";
    const b = "chart-b@example.com";
    await ensureUser(a);
    await ensureUser(b);

    await createNote(a, {
      rawText: "mitosis",
      subject: "Biology",
      researchEventId: "evt-a1",
    });
    await writeResearchEvent(a, {
      id: "evt-a1",
      kind: "classify_ingest",
      finalSubject: "Biology",
      votes: {
        gptOss: { subject: "Biology" },
        baseBert: { subject: "Biology" },
        fineTunedBert: { subject: "Biology" },
      },
    });
    await writeResearchEvent(b, {
      id: "evt-b1",
      kind: "classify_ingest",
      finalSubject: "Mathematics",
      votes: {
        gptOss: { subject: "Mathematics" },
        baseBert: { subject: "Physics" },
        fineTunedBert: { subject: "Mathematics" },
      },
    });

    const all = await listAllResearchEvents();
    assert.ok(all.some((e) => e.id === "evt-a1"));
    assert.ok(all.some((e) => e.id === "evt-b1"));

    const updated = await updateResearchEvent(a, "evt-a1", {
      userGoldSubject: "Chemistry",
      finalSubject: "Chemistry",
      corrected: true,
    });
    assert.equal(updated.userGoldSubject, "Chemistry");
    assert.equal(updated.corrected, true);
  });

  it("includes yanylevin@gmail.com in shared research metrics pools", async () => {
    const tester = "yanylevin@gmail.com";
    const real = "real-user@example.com";
    await ensureUser(tester);
    await ensureUser(real);

    await writeResearchEvent(tester, {
      id: "evt-test-noise",
      kind: "classify_ingest",
      finalSubject: "Biology",
      votes: {
        gptOss: { subject: "Biology" },
        baseBert: { subject: "Biology" },
        fineTunedBert: { subject: "Biology" },
      },
    });
    await writeResearchEvent(real, {
      id: "evt-real",
      kind: "classify_ingest",
      finalSubject: "Physics",
      votes: {
        gptOss: { subject: "Physics" },
        baseBert: { subject: "Physics" },
        fineTunedBert: { subject: "Physics" },
      },
    });

    const all = await listAllResearchEvents();
    assert.ok(all.some((e) => e.id === "evt-real"));
    assert.ok(all.some((e) => e.id === "evt-test-noise"));
    assert.ok(all.some((e) => e._userFolder === "yanylevin@gmail.com"));
  });
});
