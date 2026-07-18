import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ensureUser,
  createNote,
  listNotes,
  getNote,
  emailToFolderName,
  addCustomSubject,
  listSubjects,
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
    const { root, profile } = await ensureUser("Alice@Example.com", {
      name: "Alice",
    });
    assert.equal(profile.email, "alice@example.com");
    assert.equal(path.basename(root), "alice@example.com");
    const st = await fs.stat(root);
    assert.ok(st.isDirectory());
  });

  it("does not duplicate folders for mixed-case email", async () => {
    await ensureUser("bob@example.com");
    await ensureUser("Bob@Example.com");
    const entries = await fs.readdir(tmpRoot);
    assert.equal(entries.filter((e) => e.includes("bob@")).length, 1);
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
  });
});
