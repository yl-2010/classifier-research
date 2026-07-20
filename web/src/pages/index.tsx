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
  type NoteItem,
  type ResearchRow,
} from "@/lib/atelier-data";
import {
  availableFixedToAdd,
  loadInvokedSubjects,
  saveInvokedSubjects,
} from "@/lib/invoked-subjects";
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

function sampleHtml(title: string) {
  return `<h1>${escapeHtml(title)}</h1><section><p>Sample note.</p></section>`;
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

function formatNoteHtml(title: string, body: string) {
  const paras = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<h1>${escapeHtml(title)}</h1><section>${paras || "<p></p>"}</section>`;
}

export default function HomePage() {
  const { status } = useSession();
  const signedIn = status === "authenticated";

  const newRef = useRef<HTMLElement>(null);
  const libraryRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [invokedSubjects, setInvokedSubjects] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sentTitle, setSentTitle] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<"new" | "library">("new");
  const [folder, setFolder] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [subjectSaved, setSubjectSaved] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  const persistScroll = useCallback(() => {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  }, []);

  const scrollToSection = useCallback(
    (section: "new" | "library", behavior: ScrollBehavior = "smooth") => {
      setActiveNav(section);
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
    const jump = sessionStorage.getItem(JUMP_KEY) as "new" | "library" | null;
    if (jump === "new" || jump === "library") {
      sessionStorage.removeItem(JUMP_KEY);
      window.requestAnimationFrame(() => scrollToSection(jump, "auto"));
      return;
    }
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved == null) return;
    const y = Number.parseInt(saved, 10);
    if (!Number.isFinite(y)) return;
    window.scrollTo(0, y);
    window.requestAnimationFrame(() => {
      const libTop = libraryRef.current?.offsetTop ?? 0;
      setActiveNav(y >= libTop - 80 ? "library" : "new");
    });
  }, [signedIn, scrollToSection]);

  useEffect(() => {
    if (!signedIn) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(persistScroll, 80);
      const y = window.scrollY;
      const libTop = libraryRef.current?.offsetTop ?? 0;
      setActiveNav(y >= libTop - 120 ? "library" : "new");
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

  const sendNotes = () => {
    const value = text.trim();
    if (!value) return;
    const id = `n-${Date.now()}`;
    const title = titleFromText(value);
    // Demo classify stub - real ingest will assign subject later.
    const subject = "Physics";
    const note: NoteItem = {
      id,
      title,
      subject,
      status: "processing",
      html: "",
      orchestrator: subject,
      corrected: false,
    };
    setNotes((prev) => [note, ...prev]);
    setSentTitle(title);
    setText("");

    window.setTimeout(() => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                status: "ready",
                subject,
                orchestrator: subject,
                html: formatNoteHtml(title, value),
              }
            : n
        )
      );
      updateResearch((prev) => [
        {
          id,
          when: "now",
          orchestrator: subject,
          final: subject,
          corrected: false,
        },
        ...prev,
      ]);
    }, 2200);
  };

  const onUpload = (files: FileList | null) => {
    if (!files?.length) return;
    // OCR pipeline not wired yet - leave textarea unchanged.
  };

  const openNote = notes.find((n) => n.id === openNoteId && n.status === "ready");

  const changeSubject = (next: string) => {
    if (!openNote) return;
    if (next === openNote.subject) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === openNote.id
          ? {
              ...n,
              subject: next,
              corrected: next !== n.orchestrator,
            }
          : n
      )
    );
    persistInvoked([...invokedSubjects, next]);
    setFolder(next);
    updateResearch((prev) => {
      const existing = prev.find((r) => r.id === openNote.id);
      if (!existing) {
        return [
          {
            id: openNote.id,
            when: "now",
            orchestrator: openNote.orchestrator,
            final: next,
            corrected: next !== openNote.orchestrator,
          },
          ...prev,
        ];
      }
      return prev.map((r) =>
        r.id === openNote.id
          ? {
              ...r,
              final: next,
              corrected: next !== openNote.orchestrator,
            }
          : r
      );
    });
    setSubjectSaved(true);
    window.setTimeout(() => setSubjectSaved(false), 1600);
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
            active={activeNav}
            onNew={() => scrollToSection("new")}
            onLibrary={() => scrollToSection("library")}
          />
        )}

        {!signedIn && (
          <section className="gate">
            <div className="gate-cluster">
              <img
                className="gate-logo"
                src="/logo-plain.svg"
                alt="NoteLMs"
                width={864}
                height={360}
                decoding="async"
              />
              <div className="gate-copy">
                <p className="gate-lead">
                  Classify and organize your notes, and help build research
                  along the way.
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
              </div>
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
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste notes…"
                    rows={12}
                  />
                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => fileRef.current?.click()}
                    >
                      Upload image
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => onUpload(e.target.files)}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={sendNotes}
                      disabled={!text.trim()}
                    >
                      Send
                    </button>
                  </div>
                </>
              )}
            </section>

            <section id="library" ref={libraryRef} className="block library">
              <h2 className="section-label">Library</h2>

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
                          openNote.html || sampleHtml(openNote.title),
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
          padding: 0.5rem 0 2rem;
        }

        .gate-cluster {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
          width: fit-content;
          max-width: 100%;
        }

        .gate-logo {
          display: block;
          width: min(520px, 86vw);
          height: auto;
          opacity: 1;
          animation: gate-rise 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .gate-copy {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1.5rem;
          width: min(28rem, 100%);
        }

        .gate-lead {
          margin: 0;
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
