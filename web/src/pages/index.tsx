import Head from "next/head";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  FORMATTED_HTML,
  INITIAL_NOTES,
  INITIAL_RESEARCH,
  MOCK_NOTE,
  SUBJECT_COLORS,
  SUBJECTS,
  type NoteItem,
  type ResearchRow,
} from "@/lib/atelier-data";

const SCROLL_KEY = "notelms-scroll-y";

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

export default function HomePage() {
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";

  const newRef = useRef<HTMLElement>(null);
  const libraryRef = useRef<HTMLElement>(null);
  const researchRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);

  const [notes, setNotes] = useState<NoteItem[]>(INITIAL_NOTES);
  const [research, setResearch] = useState<ResearchRow[]>(INITIAL_RESEARCH);
  const [text, setText] = useState("");
  const [ocrOnline, setOcrOnline] = useState(true);
  const [sentTitle, setSentTitle] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<"new" | "library" | "research">(
    "new"
  );
  const [folder, setFolder] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [subjectSaved, setSubjectSaved] = useState(false);

  const persistScroll = useCallback(() => {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
  }, []);

  const scrollToSection = useCallback(
    (section: "new" | "library" | "research", behavior: ScrollBehavior = "smooth") => {
      setActiveNav(section);
      const el =
        section === "new"
          ? newRef.current
          : section === "library"
            ? libraryRef.current
            : researchRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior, block: "start" });
      window.setTimeout(persistScroll, behavior === "smooth" ? 400 : 0);
    },
    [persistScroll]
  );

  // Keep scroll position across refresh / remount
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    if (!signedIn || restoredRef.current) return;
    restoredRef.current = true;
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved == null) return;
    const y = Number.parseInt(saved, 10);
    if (!Number.isFinite(y)) return;
    window.scrollTo(0, y);
    // Infer active nav from position after restore
    window.requestAnimationFrame(() => {
      const libTop = libraryRef.current?.offsetTop ?? 0;
      const resTop = researchRef.current?.offsetTop ?? 0;
      if (y >= resTop - 80) setActiveNav("research");
      else if (y >= libTop - 80) setActiveNav("library");
      else setActiveNav("new");
    });
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(persistScroll, 80);
      const y = window.scrollY;
      const libTop = libraryRef.current?.offsetTop ?? 0;
      const resTop = researchRef.current?.offsetTop ?? 0;
      if (y >= resTop - 120) setActiveNav("research");
      else if (y >= libTop - 120) setActiveNav("library");
      else setActiveNav("new");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [signedIn, persistScroll]);

  const sendNotes = () => {
    const value = text.trim() || MOCK_NOTE;
    if (!text.trim()) setText(value);
    const id = `n-${Date.now()}`;
    const title = titleFromText(value);
    const note: NoteItem = {
      id,
      title,
      subject: "Physics",
      status: "processing",
      html: "",
      orchestrator: "Physics",
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
                subject: "Physics",
                orchestrator: "Physics",
                html: FORMATTED_HTML,
              }
            : n
        )
      );
      setResearch((prev) => [
        {
          id,
          when: "now",
          orchestrator: "Physics",
          final: "Physics",
          corrected: false,
        },
        ...prev,
      ]);
    }, 2200);
  };

  const onUpload = (files: FileList | null) => {
    if (!ocrOnline || !files?.length) return;
    setText(MOCK_NOTE);
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
    setFolder(next);
    setResearch((prev) => {
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

      <div className="app">
        <header className="top">
          <button
            type="button"
            className="brand"
            onClick={() => {
              if (signedIn) scrollToSection("new");
            }}
          >
            Note<span>LMs</span>
          </button>
          <nav className="nav">
            {signedIn ? (
              <>
                <button
                  type="button"
                  className={activeNav === "new" ? "active" : undefined}
                  onClick={() => scrollToSection("new")}
                >
                  New
                </button>
                <button
                  type="button"
                  className={activeNav === "library" ? "active" : undefined}
                  onClick={() => scrollToSection("library")}
                >
                  Library
                </button>
                <button
                  type="button"
                  className={activeNav === "research" ? "active" : undefined}
                  onClick={() => scrollToSection("research")}
                >
                  Research
                </button>
                <button
                  type="button"
                  onClick={() => void signOut({ callbackUrl: "/" })}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => void signIn("google", { callbackUrl: "/" })}
                disabled={status === "loading"}
              >
                Sign in with Google
              </button>
            )}
          </nav>
        </header>

        {!signedIn && (
          <section className="gate">
            <p className="gate-title">NoteLMs</p>
            <button
              type="button"
              className="btn"
              onClick={() => void signIn("google", { callbackUrl: "/" })}
              disabled={status === "loading"}
            >
              Sign in with Google
            </button>
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
                      className={`btn ghost${ocrOnline ? "" : " is-disabled"}`}
                      disabled={!ocrOnline}
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
                    <button type="button" className="btn" onClick={sendNotes}>
                      Send
                    </button>
                  </div>
                  <label className="ocr">
                    <input
                      type="checkbox"
                      checked={ocrOnline}
                      onChange={(e) => setOcrOnline(e.target.checked)}
                    />
                    Image upload available
                  </label>
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
                          "--subj": SUBJECT_COLORS[openNote.subject],
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
                        {SUBJECTS.map(([name]) => (
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
                        "--subj": SUBJECT_COLORS[openNote.subject],
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
                        "--subj": SUBJECT_COLORS[folder],
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
              ) : (
                <div className="folders">
                  {SUBJECTS.map(([name, color]) => {
                    const count = notes.filter(
                      (n) => n.status === "ready" && n.subject === name
                    ).length;
                    return (
                      <button
                        key={name}
                        type="button"
                        className="folder"
                        style={{ "--subj": color } as CSSProperties}
                        onClick={() => setFolder(name)}
                      >
                        <span className="fname">{name}</span>
                        <span className="fcount">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section id="research" ref={researchRef} className="block">
              <h2 className="section-label">Research</h2>
              <table className="research">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Orchestrator</th>
                    <th>Final</th>
                    <th>Source</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {research.map((r) => (
                    <tr key={`${r.id}-${r.when}-${r.final}`}>
                      <td>{r.when}</td>
                      <td>{r.orchestrator}</td>
                      <td>{r.final}</td>
                      <td>{r.corrected ? "Manual" : "Auto"}</td>
                      <td>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => {
                            const n = notes.find(
                              (x) => x.id === r.id && x.status === "ready"
                            );
                            if (!n) return;
                            setFolder(n.subject);
                            setOpenNoteId(n.id);
                            scrollToSection("library");
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>

      <style jsx>{`
        .app {
          max-width: 720px;
          margin: 0 auto;
          padding: 1.25rem 1.25rem 4rem;
        }

        .top {
          position: sticky;
          top: 0;
          z-index: 20;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin: 0 -0.25rem 1.75rem;
          padding: 0.85rem 0.25rem;
          background: color-mix(in srgb, var(--bg) 88%, transparent);
          backdrop-filter: blur(10px);
        }

        .brand {
          border: 0;
          background: none;
          padding: 0;
          cursor: pointer;
          font-family: var(--display);
          font-size: 1.35rem;
          color: var(--ink);
          letter-spacing: -0.02em;
        }

        .brand span {
          color: var(--accent);
        }

        .nav {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 1rem;
        }

        .nav > button:not(.btn) {
          border: 0;
          background: none;
          padding: 0;
          cursor: pointer;
          color: var(--mute);
          font-size: 0.9rem;
        }

        .nav > button:not(.btn):hover,
        .nav > button.active {
          color: var(--ink);
        }

        .gate {
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          gap: 1.25rem;
        }

        .gate-title {
          margin: 0;
          font-family: var(--display);
          font-size: clamp(2.4rem, 6vw, 3.4rem);
          font-weight: 500;
          letter-spacing: -0.02em;
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

        .ocr {
          display: inline-flex;
          gap: 0.45rem;
          align-items: center;
          margin-top: 1rem;
          color: var(--mute);
          font-size: 0.85rem;
          cursor: pointer;
        }

        .muted {
          color: var(--mute);
          font-size: 0.95rem;
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

        .research {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }

        .research th,
        .research td {
          text-align: left;
          padding: 0.7rem 0.4rem;
        }

        .research th {
          color: var(--mute);
          font-weight: 500;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .research tbody tr:nth-child(odd) td {
          background: color-mix(in srgb, var(--surface) 70%, transparent);
        }

        .linkish {
          background: none;
          border: 0;
          padding: 0;
          color: var(--accent);
          cursor: pointer;
          text-decoration: underline;
          font-weight: 600;
        }
      `}</style>
    </>
  );
}
