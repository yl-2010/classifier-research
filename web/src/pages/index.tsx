import Head from "next/head";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { AppNav } from "@/components/AppNav";
import { SiteFooter } from "@/components/SiteFooter";
import {
  FIXED_SUBJECTS,
  sortLibrarySubjects,
  subjectColor,
  type ModelVotes,
  type NoteItem,
  type ResearchRow,
} from "@/lib/atelier-data";
import {
  availableFixedToAdd,
  loadInvokedSubjects,
  saveInvokedSubjects,
} from "@/lib/invoked-subjects";
import { notelmsFetch, useNotelmsRuntimeConfig } from "@/lib/notelmsApi";
import { loadResearch, saveResearch } from "@/lib/research-store";

type ResearchUpdater = (prev: ResearchRow[]) => ResearchRow[];

const SCROLL_KEY = "notelms-scroll-y";
const JUMP_KEY = "notelms-jump";

function titleFromText(text: string) {
  const line = text
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  return (line || "Untitled note").slice(0, 64);
}

function escapeHtml(t: string) {
  return t.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string
  );
}

function placeholderHtml(title: string) {
  return `<h1>${escapeHtml(title)}</h1><section><p class="muted">Loading note…</p></section>`;
}

type ApiVote = { subject?: string } | null | undefined;

type ApiNoteMeta = {
  id: string;
  title?: string;
  subject?: string;
  html?: string | null;
  classification?: {
    subject?: string;
    resolvedSubject?: string;
    votes?: {
      gptOss?: ApiVote;
      baseBert?: ApiVote;
      fineTunedBert?: ApiVote;
    } | null;
  } | null;
};

function mapVotes(
  classification: ApiNoteMeta["classification"]
): ModelVotes | null {
  const v = classification?.votes;
  if (!v) return null;
  const gptOss = v.gptOss?.subject?.trim() || null;
  const baseBert = v.baseBert?.subject?.trim() || null;
  const fineTunedBert = v.fineTunedBert?.subject?.trim() || null;
  if (!gptOss && !baseBert && !fineTunedBert) return null;
  return { gptOss, baseBert, fineTunedBert };
}

function mapApiNote(meta: ApiNoteMeta): NoteItem {
  const subject = meta.subject || "Other";
  const orchestrator =
    meta.classification?.resolvedSubject ||
    meta.classification?.subject ||
    subject;
  return {
    id: meta.id,
    title: meta.title || "Untitled note",
    subject,
    status: "ready",
    html: typeof meta.html === "string" ? meta.html : "",
    orchestrator,
    corrected: false,
    votes: mapVotes(meta.classification),
  };
}

export default function HomePage() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const { apiBase } = useNotelmsRuntimeConfig();

  const newRef = useRef<HTMLElement>(null);
  const libraryRef = useRef<HTMLElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);
  const htmlFetchRef = useRef<Set<string>>(new Set());

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [invokedSubjects, setInvokedSubjects] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sentTitle, setSentTitle] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [subjectSaved, setSubjectSaved] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const persistScroll = useCallback(() => {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  }, []);

  const scrollToSection = useCallback(
    (section: "new" | "library", behavior: ScrollBehavior = "smooth") => {
      const el = section === "new" ? newRef.current : libraryRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior, block: "start" });
      window.setTimeout(persistScroll, behavior === "smooth" ? 400 : 0);
    },
    [persistScroll]
  );

  const updateResearch = useCallback((updater: ResearchUpdater) => {
    saveResearch(updater(loadResearch()));
  }, []);

  const persistInvoked = useCallback((next: string[]) => {
    const sorted = sortLibrarySubjects(next);
    setInvokedSubjects(sorted);
    saveInvokedSubjects(sorted);
  }, []);

  useEffect(() => {
    setInvokedSubjects(loadInvokedSubjects());
  }, []);

  useEffect(() => {
    if (!signedIn || !apiBase) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await notelmsFetch(apiBase, "/api/notes");
        const data = (await res.json()) as {
          ok?: boolean;
          notes?: ApiNoteMeta[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setLibraryError(data.error || "Could not load library");
          setNotes([]);
          return;
        }
        const mapped = (data.notes || []).map(mapApiNote);
        setNotes(mapped);
        setLibraryError(null);
        const subjects = mapped.map((n) => n.subject);
        if (subjects.length) {
          persistInvoked(
            sortLibrarySubjects([...loadInvokedSubjects(), ...subjects])
          );
        }
      } catch {
        if (!cancelled) {
          setLibraryError("Could not reach the note API");
          setNotes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, apiBase, persistInvoked]);

  useEffect(() => {
    if (!addingSubject) return;
    window.requestAnimationFrame(() => customInputRef.current?.focus());
  }, [addingSubject]);

  // Keep scroll position across refresh / remount
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    if (!signedIn || restoredRef.current) return;
    restoredRef.current = true;
    const jump = sessionStorage.getItem(JUMP_KEY);
    if (jump === "new" || jump === "library" || jump === "notebook") {
      sessionStorage.removeItem(JUMP_KEY);
      window.requestAnimationFrame(() =>
        scrollToSection(jump === "library" ? "library" : "new", "auto")
      );
      return;
    }
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved == null) return;
    const y = Number.parseInt(saved, 10);
    if (!Number.isFinite(y)) return;
    window.scrollTo(0, y);
  }, [signedIn, scrollToSection]);

  useEffect(() => {
    if (!signedIn) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(persistScroll, 80);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [signedIn, persistScroll]);

  const librarySubjects = useMemo(() => {
    const fromNotes = notes
      .filter((n) => n.status === "ready")
      .map((n) => n.subject);
    return sortLibrarySubjects([...invokedSubjects, ...fromNotes]);
  }, [notes, invokedSubjects]);

  const unusedFixed = useMemo(
    () => availableFixedToAdd(librarySubjects),
    [librarySubjects]
  );

  const subjectOptions = useMemo(() => {
    const custom = librarySubjects.filter(
      (s) => !(FIXED_SUBJECTS as readonly string[]).includes(s)
    );
    return sortLibrarySubjects([...FIXED_SUBJECTS, ...custom]);
  }, [librarySubjects]);

  const addSubjectToLibrary = useCallback(
    (label: string, open = true) => {
      const name = label.trim();
      if (!name || name.toLowerCase() === "other") return;
      persistInvoked([...invokedSubjects, name]);
      setAddingSubject(false);
      setCustomDraft("");
      if (open) {
        setFolder(name);
        setOpenNoteId(null);
      }
    },
    [invokedSubjects, persistInvoked]
  );

  const deleteSubjectFromLibrary = useCallback(
    async (label: string) => {
      const name = label.trim();
      if (!name || name.toLowerCase() === "other") return;

      const noteCount = notes.filter(
        (n) => n.status === "ready" && n.subject === name
      ).length;
      const message =
        noteCount > 0
          ? `Delete “${name}” and its ${noteCount} note${noteCount === 1 ? "" : "s"} from your library? Research history is kept.`
          : `Delete “${name}” from your library?`;
      if (!window.confirm(message)) return;

      setDeletingSubject(true);
      try {
        if (apiBase) {
          try {
            await notelmsFetch(apiBase, "/api/subjects", {
              method: "DELETE",
              body: JSON.stringify({ label: name }),
            });
          } catch {
            // Local library still updates if the Mac API is unreachable.
          }
        }

        // Drop notes in this subject only — leave research rows untouched.
        setNotes((prev) => prev.filter((n) => n.subject !== name));
        persistInvoked(
          invokedSubjects.filter((s) => s.toLowerCase() !== name.toLowerCase())
        );
        setFolder(null);
        setOpenNoteId(null);
        setAddingSubject(false);
      } finally {
        setDeletingSubject(false);
      }
    },
    [apiBase, invokedSubjects, notes, persistInvoked]
  );

  const deleteOpenNote = useCallback(async () => {
    if (!openNoteId || deletingNote) return;
    const note = notes.find((n) => n.id === openNoteId);
    if (!note) return;

    const label = note.title || "this note";
    if (!window.confirm(`Delete “${label}”? Research history is kept.`)) return;

    const subject = note.subject;
    setDeletingNote(true);
    try {
      if (apiBase) {
        const res = await notelmsFetch(apiBase, `/api/notes/${openNoteId}`, {
          method: "DELETE",
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Could not delete note");
        }
      }
      setNotes((prev) => prev.filter((n) => n.id !== openNoteId));
      setOpenNoteId(null);
      setFolder(subject);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not delete note"
      );
    } finally {
      setDeletingNote(false);
    }
  }, [apiBase, deletingNote, notes, openNoteId]);

  const submitCustomSubject = (e: FormEvent) => {
    e.preventDefault();
    const name = customDraft.trim();
    if (!name) return;
    if (name.toLowerCase() === "other") return;
    const exists = librarySubjects.some(
      (s) => s.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      const match =
        librarySubjects.find((s) => s.toLowerCase() === name.toLowerCase()) ||
        name;
      setAddingSubject(false);
      setCustomDraft("");
      setFolder(match);
      return;
    }
    addSubjectToLibrary(name);
  };

  const sendNotes = async () => {
    const value = text.trim();
    if (!value || sending) return;
    if (!apiBase) {
      setIngestError("Note API is not configured");
      return;
    }

    const tempId = `pending-${Date.now()}`;
    const title = titleFromText(value);
    setIngestError(null);
    setSending(true);
    setNotes((prev) => [
      {
        id: tempId,
        title,
        subject: "…",
        status: "processing",
        html: "",
        orchestrator: "",
        corrected: false,
        votes: null,
      },
      ...prev,
    ]);
    setSentTitle(title);
    setText("");

    try {
      const res = await notelmsFetch(apiBase, "/api/notes/ingest", {
        method: "POST",
        body: JSON.stringify({ rawText: value, source: "paste" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        note?: ApiNoteMeta;
        resolved?: { subject?: string; createdCustom?: string | null };
        orchestrator?: { subject?: string };
      };
      if (!res.ok || !data.ok || !data.note) {
        throw new Error(data.error || "Ingest failed");
      }

      const mapped = mapApiNote(data.note);
      const orchestratorSubject =
        data.orchestrator?.subject ||
        data.resolved?.subject ||
        mapped.orchestrator;
      const finalSubject = data.resolved?.subject || mapped.subject;

      setSentTitle(mapped.title);
      setNotes((prev) =>
        prev.map((n) =>
          n.id === tempId
            ? {
                ...mapped,
                subject: finalSubject,
                orchestrator: orchestratorSubject,
                status: "ready",
              }
            : n
        )
      );

      if (data.resolved?.createdCustom) {
        persistInvoked([...invokedSubjects, data.resolved.createdCustom]);
      } else {
        persistInvoked([...invokedSubjects, finalSubject]);
      }

      updateResearch((prev) => [
        {
          id: mapped.id,
          when: "now",
          orchestrator: orchestratorSubject,
          final: finalSubject,
          corrected: false,
        },
        ...prev,
      ]);
    } catch (err) {
      setNotes((prev) => prev.filter((n) => n.id !== tempId));
      setSentTitle(null);
      setText(value);
      setIngestError(
        err instanceof Error ? err.message : "Could not classify notes"
      );
    } finally {
      setSending(false);
    }
  };

  const openNote = notes.find((n) => n.id === openNoteId && n.status === "ready");

  const openNoteNeedsHtml = Boolean(
    openNote && openNote.status === "ready" && !openNote.html
  );

  useEffect(() => {
    if (!openNoteId || !apiBase || !signedIn || !openNoteNeedsHtml) return;
    if (htmlFetchRef.current.has(openNoteId)) return;
    htmlFetchRef.current.add(openNoteId);
    let cancelled = false;
    (async () => {
      try {
        const res = await notelmsFetch(apiBase, `/api/notes/${openNoteId}`);
        const data = (await res.json()) as {
          ok?: boolean;
          note?: ApiNoteMeta;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok || !data.note) return;
        const html =
          typeof data.note.html === "string" ? data.note.html : "";
        setNotes((prev) =>
          prev.map((n) => (n.id === openNoteId ? { ...n, html } : n))
        );
      } catch {
        /* keep placeholder; ref stays set so we do not retry spam */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openNoteId, apiBase, signedIn, openNoteNeedsHtml]);

  const changeSubject = async (next: string) => {
    if (!openNote) return;
    if (next === openNote.subject) return;

    const prevSubject = openNote.subject;
    const noteId = openNote.id;
    const corrected = next !== openNote.orchestrator;

    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? {
              ...n,
              subject: next,
              corrected,
            }
          : n
      )
    );
    persistInvoked([...invokedSubjects, next]);
    setFolder(next);
    updateResearch((prev) => {
      const existing = prev.find((r) => r.id === noteId);
      if (!existing) {
        return [
          {
            id: noteId,
            when: "now",
            orchestrator: openNote.orchestrator,
            final: next,
            corrected,
          },
          ...prev,
        ];
      }
      return prev.map((r) =>
        r.id === noteId
          ? {
              ...r,
              final: next,
              corrected,
            }
          : r
      );
    });
    setSubjectSaved(true);
    window.setTimeout(() => setSubjectSaved(false), 1600);

    if (!apiBase) return;
    try {
      const res = await notelmsFetch(apiBase, `/api/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ subject: next }),
      });
      if (!res.ok) {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? {
                  ...n,
                  subject: prevSubject,
                  corrected: prevSubject !== n.orchestrator,
                }
              : n
          )
        );
      }
    } catch {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? {
                ...n,
                subject: prevSubject,
                corrected: prevSubject !== n.orchestrator,
              }
            : n
        )
      );
    }
  };

  const processing = notes.filter((n) => n.status === "processing");
  const folderNotes = folder
    ? notes.filter((n) => n.status === "ready" && n.subject === folder)
    : [];

  return (
    <>
      <Head>
        <title>NoteLMs</title>
        <meta
          name="description"
          content="NoteLMs classifies and organizes student notes."
        />
      </Head>

      <div className={`app${!signedIn ? " app-gate" : ""}`}>
        {signedIn && (
          <AppNav
            active="notebook"
            onNotebook={() => scrollToSection("new")}
          />
        )}

        {!signedIn && (
          <section className="gate">
            <img
              className="gate-logo"
              src="/logo-plain.svg"
              alt="NoteLMs"
              width={600}
              height={211}
              decoding="async"
            />
            <p className="gate-lead">
              Classify and organize your notes, and help build research along
              the way.
            </p>
            <div className="gate-actions">
              <button
                type="button"
                className="btn"
                onClick={() => void signIn("google", { callbackUrl: "/" })}
                disabled={status === "loading"}
              >
                Sign in with Google
              </button>
              <Link href="/research" className="btn gate-research">
                View Research
              </Link>
            </div>
          </section>
        )}

        {signedIn && (
          <>
            <section id="new-note" ref={newRef} className="block">
              {sentTitle ? (
                <div className="sent-card">
                  <p className="sent-ok">Received</p>
                  <p className="sent-name">{sentTitle}</p>
                  <p className="muted">
                    You’ll find it in your library when it’s ready.
                  </p>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setSentTitle(null);
                        scrollToSection("library");
                      }}
                    >
                      Library
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setSentTitle(null)}
                    >
                      New note
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (ingestError) setIngestError(null);
                    }}
                    placeholder="Paste notes…"
                    rows={12}
                    disabled={sending}
                  />
                  {ingestError && <p className="form-error">{ingestError}</p>}
                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost is-disabled"
                      disabled
                      aria-disabled="true"
                      title="Image upload unavailable — paste text only."
                    >
                      Upload image
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void sendNotes()}
                      disabled={!text.trim() || sending}
                    >
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                  <p className="muted upload-hint">
                    Image upload unavailable — paste text only.
                  </p>
                </>
              )}
            </section>

            <section id="library" ref={libraryRef} className="block library">
              <h2 className="section-label">Library</h2>
              {libraryError && <p className="form-error">{libraryError}</p>}

              {processing.length > 0 && (
                <div className="processing">
                  {processing.map((n) => (
                    <div key={n.id} className="pending">
                      <span>{n.title}</span>
                      <span className="muted">Processing</span>
                    </div>
                  ))}
                </div>
              )}

              {openNote ? (
                <div className="note-view">
                  <div className="note-meta">
                    <h1
                      className="page-title"
                      style={
                        {
                          "--subj": subjectColor(openNote.subject),
                        } as CSSProperties
                      }
                    >
                      {openNote.title}
                    </h1>
                    <div className="subject-edit">
                      <label htmlFor="subject-select">Subject</label>
                      <select
                        id="subject-select"
                        value={openNote.subject}
                        onChange={(e) => changeSubject(e.target.value)}
                      >
                        {subjectOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {subjectSaved && <span className="saved">Updated</span>}
                    </div>
                  </div>
                  <div
                    className="note-shell"
                    style={
                      {
                        "--subj": subjectColor(openNote.subject),
                      } as CSSProperties
                    }
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html:
                          openNote.html || placeholderHtml(openNote.title),
                      }}
                    />
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        setOpenNoteId(null);
                        setFolder(openNote.subject);
                      }}
                    >
                      Back
                    </button>
                    {openNote.votes && (
                      <p className="model-votes muted">
                        GPT: {openNote.votes.gptOss || "—"}
                        {" · "}
                        Zero-shot: {openNote.votes.baseBert || "—"}
                        {" · "}
                        Fine-tuned: {openNote.votes.fineTunedBert || "—"}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn ghost danger actions-end"
                      disabled={deletingNote}
                      onClick={() => void deleteOpenNote()}
                    >
                      {deletingNote ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              ) : folder ? (
                <div className="folder-view">
                  <h1
                    className="page-title"
                    style={
                      {
                        "--subj": subjectColor(folder),
                      } as CSSProperties
                    }
                  >
                    {folder}
                  </h1>
                  <div className="note-list">
                    {folderNotes.length === 0 ? (
                      <p className="muted">No notes yet</p>
                    ) : (
                      folderNotes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className="note-item"
                          onClick={() => setOpenNoteId(n.id)}
                        >
                          {n.title}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setFolder(null)}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn ghost danger"
                      disabled={deletingSubject}
                      onClick={() => deleteSubjectFromLibrary(folder)}
                    >
                      {deletingSubject ? "Deleting…" : "Delete subject"}
                    </button>
                  </div>
                </div>
              ) : addingSubject ? (
                <div className="add-subject">
                  <p className="add-lead">
                    Add a subject to your library. Pick one of the eight, or
                    type your own.
                  </p>
                  {unusedFixed.length > 0 && (
                    <div className="pick-grid">
                      {unusedFixed.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="pick"
                          style={
                            {
                              "--subj": subjectColor(name),
                            } as CSSProperties
                          }
                          onClick={() => addSubjectToLibrary(name)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                  <form className="custom-form" onSubmit={submitCustomSubject}>
                    <label htmlFor="custom-subject" className="sr-only">
                      New subject name
                    </label>
                    <input
                      id="custom-subject"
                      ref={customInputRef}
                      type="text"
                      value={customDraft}
                      onChange={(e) => setCustomDraft(e.target.value)}
                      placeholder="Or type a new subject…"
                      maxLength={64}
                      autoComplete="off"
                    />
                    <div className="actions">
                      <button
                        type="submit"
                        className="btn"
                        disabled={!customDraft.trim()}
                      >
                        Add subject
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setAddingSubject(false);
                          setCustomDraft("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="folders-wrap">
                  {librarySubjects.length === 0 ? (
                    <p className="muted empty-lib">
                      No subjects yet. Add one to get started, or send a note
                      and it’ll appear here when ready.
                    </p>
                  ) : (
                    <div className="folders">
                      {librarySubjects.map((name) => {
                        const count = notes.filter(
                          (n) => n.status === "ready" && n.subject === name
                        ).length;
                        return (
                          <button
                            key={name}
                            type="button"
                            className="folder"
                            style={
                              {
                                "--subj": subjectColor(name),
                              } as CSSProperties
                            }
                            onClick={() => setFolder(name)}
                          >
                            <span className="fname">{name}</span>
                            <span className="fcount">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setAddingSubject(true)}
                    >
                      Add subject
                    </button>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        <SiteFooter />
      </div>

      <style jsx>{`
        .app {
          max-width: 720px;
          margin: 0 auto;
          padding: 1.25rem 1.25rem 0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .app-gate {
          max-width: 860px;
          padding-top: clamp(2.5rem, 8vh, 5rem);
        }

        .gate {
          flex: 1;
          min-height: min(68vh, 640px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          gap: 1.5rem;
          padding: 0.5rem 0 2rem;
        }

        .gate-logo {
          display: block;
          width: min(420px, 88vw);
          height: auto;
          opacity: 1;
          /* Cropped SVG: ink starts at the left edge of the box */
          margin: 0;
          animation: gate-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .gate-lead {
          margin: 0;
          max-width: 28rem;
          color: var(--mute);
          font-size: clamp(1.05rem, 2.4vw, 1.2rem);
          line-height: 1.55;
          animation: gate-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
        }

        .gate-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
          margin-top: 0.35rem;
          animation: gate-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both;
        }

        :global(.gate-research),
        .gate-research {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          background: color-mix(in srgb, var(--ink) 7%, transparent);
          color: var(--ink);
          box-shadow: inset 0 0 0 1.5px
            color-mix(in srgb, var(--accent) 35%, transparent);
        }

        :global(.gate-research:hover),
        .gate-research:hover {
          background: color-mix(in srgb, var(--accent) 12%, transparent);
          color: var(--ink);
        }

        @keyframes gate-rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .block {
          scroll-margin-top: 4.5rem;
          margin-bottom: 3.5rem;
        }

        .library {
          min-height: 70vh;
        }

        .section-label {
          margin: 0 0 1rem;
          font-family: var(--display);
          font-size: 1.35rem;
          font-weight: 500;
        }

        textarea {
          width: 100%;
          min-height: 300px;
          resize: vertical;
          border: 0;
          background: var(--surface);
          color: var(--ink);
          padding: 1.1rem 1.2rem;
          border-radius: var(--radius);
        }

        textarea:focus {
          outline: none;
          box-shadow: 0 0 0 2px
            color-mix(in srgb, var(--accent) 28%, transparent);
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-top: 1rem;
          align-items: center;
        }

        .actions-end {
          margin-left: auto;
        }

        .model-votes {
          margin: 0;
          font-size: 0.75rem;
          line-height: 1.35;
          letter-spacing: 0.01em;
        }

        :global(.btn),
        .btn {
          border: 0;
          cursor: pointer;
          font-weight: 600;
          padding: 0.7rem 1.15rem;
          border-radius: var(--radius);
          background: var(--accent);
          color: var(--on-accent);
        }

        :global(.btn.ghost),
        .btn.ghost {
          background: color-mix(in srgb, var(--ink) 6%, transparent);
          color: var(--ink);
        }

        .btn.ghost.danger {
          color: #9b2c2c;
          background: color-mix(in srgb, #9b2c2c 8%, transparent);
        }

        .btn.ghost.danger:hover:not(:disabled) {
          background: color-mix(in srgb, #9b2c2c 14%, transparent);
        }

        :global(.btn.is-disabled),
        :global(.btn:disabled),
        .btn.is-disabled,
        .btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
          filter: grayscale(0.3);
        }

        .muted {
          color: var(--mute);
          font-size: 0.95rem;
        }

        .upload-hint {
          margin: 0.35rem 0 0;
          font-size: 0.85rem;
        }

        .form-error {
          margin: 0.65rem 0 0;
          color: #9b2c2c;
          font-size: 0.92rem;
        }

        .empty-lib {
          margin: 0 0 0.25rem;
        }

        .sent-card {
          background: var(--surface);
          border-radius: var(--radius);
          padding: 2rem 1.5rem;
          text-align: center;
        }

        .sent-ok {
          margin: 0 0 0.35rem;
          font-family: var(--display);
          font-size: 1.75rem;
          color: var(--accent);
          font-weight: 500;
        }

        .sent-name {
          margin: 0 0 0.75rem;
          font-weight: 600;
        }

        .processing {
          margin-bottom: 1rem;
          display: grid;
          gap: 0.5rem;
        }

        .pending {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: center;
          padding: 0.85rem 1rem;
          border-radius: var(--radius);
          background: var(--surface);
        }

        .folders {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.65rem;
        }

        .folder {
          border: 0;
          background: var(--surface);
          text-align: left;
          padding: 0.9rem 1rem;
          border-radius: var(--radius);
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.5rem;
          box-shadow: inset 3px 0 0 var(--subj);
        }

        .fname {
          font-weight: 600;
          font-size: 0.92rem;
        }

        .fcount {
          color: var(--mute);
          font-size: 0.85rem;
        }

        .add-subject {
          display: grid;
          gap: 1rem;
        }

        .add-lead {
          margin: 0;
          color: var(--mute);
          font-size: 0.95rem;
        }

        .pick-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.55rem;
        }

        .pick {
          border: 0;
          background: var(--surface);
          text-align: left;
          padding: 0.85rem 1rem;
          border-radius: var(--radius);
          cursor: pointer;
          font-weight: 600;
          font-size: 0.92rem;
          box-shadow: inset 3px 0 0 var(--subj);
        }

        .pick:hover {
          background: color-mix(in srgb, var(--subj) 10%, var(--surface));
        }

        .custom-form {
          display: grid;
          gap: 0.35rem;
        }

        .custom-form input {
          width: 100%;
          border: 0;
          background: var(--surface);
          color: var(--ink);
          padding: 0.85rem 1rem;
          border-radius: var(--radius);
          font-size: 1rem;
        }

        .custom-form input:focus {
          outline: none;
          box-shadow: 0 0 0 2px
            color-mix(in srgb, var(--accent) 28%, transparent);
        }

        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .note-list {
          display: grid;
          gap: 0.5rem;
        }

        .note-item {
          width: 100%;
          text-align: left;
          border: 0;
          background: var(--surface);
          padding: 0.85rem 1rem;
          border-radius: var(--radius);
          cursor: pointer;
        }

        .note-item:hover {
          background: color-mix(in srgb, var(--accent) 8%, var(--surface));
        }

        .page-title {
          font-family: var(--display);
          font-size: 1.5rem;
          font-weight: 500;
          margin: 0 0 1rem;
          color: var(--subj, var(--ink));
        }

        .note-meta {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: end;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .note-meta .page-title {
          margin: 0;
        }

        .subject-edit {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--mute);
          font-size: 0.9rem;
        }

        .subject-edit select {
          color: var(--ink);
          border: 0;
          background: var(--surface);
          border-radius: var(--radius);
          padding: 0.45rem 0.6rem;
        }

        .saved {
          color: var(--accent);
          font-size: 0.85rem;
          font-weight: 600;
        }

        .note-shell {
          background: var(--surface);
          box-shadow: inset 0 3px 0 var(--subj, var(--accent));
          border-radius: var(--radius);
          padding: 1.35rem 1.4rem;
        }

        .note-shell :global(h1) {
          font-family: var(--display);
          font-size: 1.45rem;
          margin: 0 0 0.75rem;
          color: var(--subj, var(--ink));
        }

        .note-shell :global(h2) {
          font-size: 1rem;
          margin: 1.1rem 0 0.4rem;
        }

        .note-shell :global(.eq) {
          font-family: ui-monospace, monospace;
          padding: 0.5rem 0.7rem;
          background: color-mix(
            in srgb,
            var(--subj, var(--accent)) 10%,
            var(--surface)
          );
          border-radius: calc(var(--radius) - 2px);
        }
      `}</style>
    </>
  );
}
