import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
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
import { ThemeLogo } from "@/components/ThemeLogo";
import {
  FIXED_SUBJECTS,
  sortLibrarySubjects,
  subjectColor,
  type ModelVotes,
  type NoteItem,
  type ResearchRow,
} from "@/lib/atelier-data";
import { exportNotePdf } from "@/lib/exportNotePdf";
import {
  availableFixedToAdd,
  loadInvokedSubjects,
  saveInvokedSubjects,
} from "@/lib/invoked-subjects";
import { notelmsFetch, useNotelmsRuntimeConfig } from "@/lib/notelmsApi";
import { renderNoteMath } from "@/lib/renderNoteMath";
import { loadResearch, saveResearch } from "@/lib/research-store";
import { useOpenAiOcrAvailable } from "@/lib/useOpenAiOcrAvailable";
import { useUiContext } from "@/lib/uiContext";
import {
  findLabelBySlug,
  findNoteBySlug,
  notePath,
  subjectPath,
} from "@/lib/slugs";

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
  summary?: string | null;
  createdAt?: string;
  updatedAt?: string;
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

function dayOrdinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** e.g. "June 5th, 2010" — date only, no time. */
function formatUploadedDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const month = d.toLocaleString("en-US", { month: "long" });
  return `${month} ${dayOrdinal(d.getDate())}, ${d.getFullYear()}`;
}

function noteCreatedMs(n: Pick<NoteItem, "createdAt">): number {
  const t = n.createdAt ? Date.parse(n.createdAt) : NaN;
  return Number.isFinite(t) ? t : 0;
}

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
    createdAt: meta.createdAt || meta.updatedAt,
    summary:
      typeof meta.summary === "string" && meta.summary.trim()
        ? meta.summary.trim()
        : undefined,
  };
}

function stripHtmlToText(html?: string | null): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function HomePage() {
  const router = useRouter();
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const { apiBase } = useNotelmsRuntimeConfig();
  const { available: imageOcrAvailable } = useOpenAiOcrAvailable();
  const { setUiContext, setOnSubjectColorsUpdated } = useUiContext();

  const pathParts = useMemo(() => {
    const raw = router.query.path;
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === "string" && raw) return [raw];
    return [] as string[];
  }, [router.query.path]);
  const subjectSlug = pathParts[0] || null;
  const noteSlug = pathParts[1] || null;

  const newRef = useRef<HTMLElement>(null);
  const libraryRef = useRef<HTMLElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);
  const htmlFetchRef = useRef<Set<string>>(new Set());
  const mathHostRef = useRef<HTMLDivElement>(null);
  const noteShellRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [invokedSubjects, setInvokedSubjects] = useState<string[]>([]);
  const [customSubjectColors, setCustomSubjectColors] = useState<
    Record<string, string>
  >({});
  const [text, setText] = useState("");
  const [sentTitle, setSentTitle] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [subjectSaved, setSubjectSaved] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sending, setSending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoaded, setLibraryLoaded] = useState(false);

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
    setOnSubjectColorsUpdated((update) => {
      if (update.colors && typeof update.colors === "object") {
        setCustomSubjectColors(update.colors);
        return;
      }
      if (update.label && update.color) {
        setCustomSubjectColors((prev) => ({
          ...prev,
          [update.label!]: update.color!,
        }));
      }
    });
    return () => setOnSubjectColorsUpdated(null);
  }, [setOnSubjectColorsUpdated]);

  useEffect(() => {
    if (!signedIn) return;
    if (!apiBase) {
      setLibraryLoaded(true);
      return;
    }
    let cancelled = false;
    setLibraryLoaded(false);
    (async () => {
      try {
        const [notesRes, subjectsRes] = await Promise.all([
          notelmsFetch(apiBase, "/api/notes"),
          notelmsFetch(apiBase, "/api/subjects"),
        ]);
        const data = (await notesRes.json()) as {
          ok?: boolean;
          notes?: ApiNoteMeta[];
          error?: string;
        };
        const subjectsData = (await subjectsRes.json().catch(() => ({}))) as {
          ok?: boolean;
          custom?: string[];
          colors?: Record<string, string>;
        };
        if (cancelled) return;
        if (
          subjectsRes.ok &&
          subjectsData.ok &&
          subjectsData.colors &&
          typeof subjectsData.colors === "object"
        ) {
          setCustomSubjectColors(subjectsData.colors);
        }
        if (
          subjectsRes.ok &&
          subjectsData.ok &&
          Array.isArray(subjectsData.custom) &&
          subjectsData.custom.length
        ) {
          persistInvoked(
            sortLibrarySubjects([
              ...loadInvokedSubjects(),
              ...subjectsData.custom,
            ])
          );
        }
        if (!notesRes.ok || !data.ok) {
          setLibraryError(data.error || "Could not load library");
          setNotes([]);
          setLibraryLoaded(true);
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
        setLibraryLoaded(true);
      } catch {
        if (!cancelled) {
          setLibraryError("Could not reach the note API");
          setNotes([]);
          setLibraryLoaded(true);
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

  const goLibraryHome = useCallback(() => {
    void router.push("/");
  }, [router]);

  const openSubject = useCallback(
    (name: string) => {
      void router.push(subjectPath(name));
    },
    [router]
  );

  const openNoteAt = useCallback(
    (subject: string, title: string) => {
      void router.push(notePath(subject, title));
    },
    [router]
  );

  // Sync folder / open note from the URL once the library is ready.
  useEffect(() => {
    if (!router.isReady || !signedIn) return;

    if (!subjectSlug) {
      setFolder(null);
      setOpenNoteId(null);
      return;
    }

    // Wait for notes fetch (and invoked subjects) before rejecting unknown slugs.
    if (!libraryLoaded) return;

    const subject = findLabelBySlug(librarySubjects, subjectSlug);
    if (!subject) {
      void router.replace("/");
      return;
    }

    setFolder(subject);

    if (!noteSlug) {
      setOpenNoteId(null);
      return;
    }

    const inSubject = notes.filter(
      (n) => n.status === "ready" && n.subject === subject
    );
    const match = findNoteBySlug(inSubject, noteSlug);
    if (!match) {
      void router.replace(subjectPath(subject));
      return;
    }
    setOpenNoteId(match.id);
  }, [
    router,
    router.isReady,
    signedIn,
    subjectSlug,
    noteSlug,
    libraryLoaded,
    librarySubjects,
    notes,
  ]);

  // Deep links into a subject/note should land in the library section.
  useEffect(() => {
    if (!signedIn || !subjectSlug) return;
    window.requestAnimationFrame(() => scrollToSection("library", "auto"));
  }, [signedIn, subjectSlug, noteSlug, scrollToSection]);

  const addSubjectToLibrary = useCallback(
    (
      label: string,
      open = true,
      opts: { skipApi?: boolean } = {}
    ) => {
      const name = label.trim();
      if (!name || name.toLowerCase() === "other") return;
      persistInvoked([...invokedSubjects, name]);
      setAddingSubject(false);
      setCustomDraft("");

      // Ensure Mac profile has the accent (fixed → canonical default, no GPT).
      // Custom creates already POSTed in submitCustomSubject — skipApi avoids a
      // second concurrent profile write that used to clobber sibling colors.
      if (apiBase && !opts.skipApi) {
        void (async () => {
          try {
            const res = await notelmsFetch(apiBase, "/api/subjects", {
              method: "POST",
              body: JSON.stringify({ label: name }),
            });
            const data = (await res.json()) as {
              ok?: boolean;
              color?: string;
              subjects?: { colors?: Record<string, string> };
            };
            if (!res.ok || !data.ok) return;
            if (data.subjects?.colors && typeof data.subjects.colors === "object") {
              setCustomSubjectColors(data.subjects.colors);
            } else if (typeof data.color === "string") {
              setCustomSubjectColors((prev) => ({ ...prev, [name]: data.color! }));
            }
          } catch {
            /* Mac/tunnel may be offline */
          }
        })();
      }

      if (open) openSubject(name);
    },
    [apiBase, invokedSubjects, openSubject, persistInvoked]
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
          ? `Delete “${name}” and its ${noteCount} note${noteCount === 1 ? "" : "s"} from your library?`
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

        const removedIds = new Set(
          notes.filter((n) => n.subject === name).map((n) => n.id)
        );
        setNotes((prev) => prev.filter((n) => n.subject !== name));
        updateResearch((prev) => prev.filter((r) => !removedIds.has(r.id)));
        setCustomSubjectColors((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (key.toLowerCase() === name.toLowerCase()) delete next[key];
          }
          return next;
        });
        persistInvoked(
          invokedSubjects.filter((s) => s.toLowerCase() !== name.toLowerCase())
        );
        goLibraryHome();
        setAddingSubject(false);
      } finally {
        setDeletingSubject(false);
      }
    },
    [apiBase, goLibraryHome, invokedSubjects, notes, persistInvoked, updateResearch]
  );

  const deleteOpenNote = useCallback(async () => {
    if (!openNoteId || deletingNote) return;
    const note = notes.find((n) => n.id === openNoteId);
    if (!note) return;

    const label = note.title || "this note";
    if (!window.confirm(`Delete “${label}”?`)) return;

    const subject = note.subject;
    const noteId = openNoteId;
    setDeletingNote(true);
    try {
      if (apiBase) {
        const res = await notelmsFetch(apiBase, `/api/notes/${noteId}`, {
          method: "DELETE",
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Could not delete note");
        }
      }
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      updateResearch((prev) => prev.filter((r) => r.id !== noteId));
      openSubject(subject);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not delete note"
      );
    } finally {
      setDeletingNote(false);
    }
  }, [apiBase, deletingNote, notes, openNoteId, openSubject, updateResearch]);

  const submitCustomSubject = async (e: FormEvent) => {
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
      openSubject(match);
      return;
    }

    if (apiBase) {
      try {
        const res = await notelmsFetch(apiBase, "/api/subjects", {
          method: "POST",
          body: JSON.stringify({ label: name }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          color?: string;
          subjects?: { custom?: string[]; colors?: Record<string, string> };
          error?: string;
        };
        if (res.ok && data.ok) {
          if (data.subjects?.colors && typeof data.subjects.colors === "object") {
            setCustomSubjectColors(data.subjects.colors);
          } else if (typeof data.color === "string") {
            setCustomSubjectColors((prev) => ({ ...prev, [name]: data.color! }));
          }
          const saved =
            data.subjects?.custom?.find(
              (s) => s.toLowerCase() === name.toLowerCase()
            ) || name;
          addSubjectToLibrary(saved, true, { skipApi: true });
          return;
        }
      } catch {
        // Fall through: still add locally with gray if the Mac API is down.
      }
    }

    addSubjectToLibrary(name);
  };

  const sendNotes = async (
    rawOverride?: string,
    source: "paste" | "image" = "paste"
  ) => {
    const value = (rawOverride ?? text).trim();
    if (!value || sending || extracting) return;
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
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setSentTitle(title);
    setText("");

    try {
      const res = await notelmsFetch(apiBase, "/api/notes/ingest", {
        method: "POST",
        body: JSON.stringify({ rawText: value, source }),
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
      setSentTitle(null);

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

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Could not read image"));
          return;
        }
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });

  const processImageFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setIngestError("Please drop or upload an image file");
      return;
    }
    if (sending || extracting) return;
    if (!apiBase) {
      setIngestError("Note API is not configured");
      return;
    }

    setIngestError(null);
    setExtracting(true);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await notelmsFetch(apiBase, "/api/notes/ocr", {
        method: "POST",
        body: JSON.stringify({
          imageBase64,
          mimeType: file.type || "image/jpeg",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        rawText?: string;
      };
      if (!res.ok || !data.ok || !data.rawText?.trim()) {
        throw new Error(data.error || "Could not extract text from image");
      }
      setExtracting(false);
      await sendNotes(data.rawText, "image");
    } catch (err) {
      setIngestError(
        err instanceof Error ? err.message : "Could not extract text from image"
      );
      setExtracting(false);
    }
  };

  const openNote = notes.find((n) => n.id === openNoteId && n.status === "ready");
  const pendingOpenNote =
    openNoteId && !openNote
      ? notes.find((n) => n.id === openNoteId)
      : undefined;

  useEffect(() => {
    if (!signedIn) {
      setUiContext({ page: "home" });
      return;
    }
    if (openNoteId && openNote) {
      setUiContext({
        page: "note",
        subject: openNote.subject,
        noteId: openNote.id,
        noteTitle: openNote.title,
        noteText: stripHtmlToText(openNote.html) || openNote.summary || "",
      });
      return;
    }
    // Note selected but not ready in the list yet — still publish noteId so chat
    // does not briefly fall back to library/home (or keep the previous note).
    if (openNoteId) {
      setUiContext({
        page: "note",
        subject: pendingOpenNote?.subject ?? null,
        noteId: openNoteId,
        noteTitle: pendingOpenNote?.title ?? null,
        noteText:
          stripHtmlToText(pendingOpenNote?.html || "") ||
          pendingOpenNote?.summary ||
          null,
      });
      return;
    }
    if (folder) {
      setUiContext({
        page: "library",
        subject: folder,
        noteId: null,
        noteTitle: null,
        noteText: null,
      });
      return;
    }
    setUiContext({
      page: "home",
      subject: null,
      noteId: null,
      noteTitle: null,
      noteText: null,
    });
  }, [
    signedIn,
    openNoteId,
    openNote?.id,
    openNote?.subject,
    openNote?.title,
    openNote?.html,
    openNote?.summary,
    pendingOpenNote?.subject,
    pendingOpenNote?.title,
    pendingOpenNote?.html,
    pendingOpenNote?.summary,
    folder,
    setUiContext,
  ]);

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
        const summary =
          typeof data.note.summary === "string" && data.note.summary.trim()
            ? data.note.summary.trim()
            : undefined;
        setNotes((prev) =>
          prev.map((n) =>
            n.id === openNoteId
              ? { ...n, html, summary: summary ?? n.summary }
              : n
          )
        );
      } catch {
        /* keep placeholder; ref stays set so we do not retry spam */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openNoteId, apiBase, signedIn, openNoteNeedsHtml]);

  useLayoutEffect(() => {
    renderNoteMath(mathHostRef.current);
  }, [openNoteId, openNote?.html]);

  const exportOpenNotePdf = async () => {
    if (!openNote || !noteShellRef.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      await exportNotePdf(noteShellRef.current, openNote.title);
    } catch (err) {
      setLibraryError(
        err instanceof Error ? err.message : "Could not export PDF"
      );
    } finally {
      setExportingPdf(false);
    }
  };
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
    openNoteAt(next, openNote.title);
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
    ? notes
        .filter((n) => n.status === "ready" && n.subject === folder)
        .slice()
        .sort((a, b) => noteCreatedMs(b) - noteCreatedMs(a))
    : [];

  return (
    <>
      <Head>
        <title>
          {openNote
            ? `${openNote.title} · NoteLMs`
            : folder
              ? `${folder} · NoteLMs`
              : "NoteLMs"}
        </title>
        <meta
          name="description"
          content="NoteLMs classifies and organizes student notes."
        />
      </Head>

      <div className={`app${!signedIn ? " app-gate" : ""}`}>
        {signedIn && (
          <AppNav
            active="notebook"
            onNotebook={() => {
              if (subjectSlug) {
                void router.push("/").then(() => {
                  scrollToSection("new");
                });
                return;
              }
              scrollToSection("new");
            }}
          />
        )}

        {!signedIn && (
          <section className="gate">
            <ThemeLogo
              className="gate-logo"
              alt="NoteLMs"
              width={600}
              height={211}
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
              <Link href="/research" className="btn gate-secondary">
                View Research
              </Link>
              <Link href="/about" className="btn gate-secondary">
                About
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
                  <div className="actions actions-sent">
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
                    className={
                      imageOcrAvailable && dragOver ? "drag-over" : undefined
                    }
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (ingestError) setIngestError(null);
                    }}
                    onDragEnter={
                      imageOcrAvailable
                        ? (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dragDepthRef.current += 1;
                            setDragOver(true);
                          }
                        : undefined
                    }
                    onDragOver={
                      imageOcrAvailable
                        ? (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = "copy";
                          }
                        : undefined
                    }
                    onDragLeave={
                      imageOcrAvailable
                        ? (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dragDepthRef.current = Math.max(
                              0,
                              dragDepthRef.current - 1
                            );
                            if (dragDepthRef.current === 0) setDragOver(false);
                          }
                        : undefined
                    }
                    onDrop={
                      imageOcrAvailable
                        ? (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dragDepthRef.current = 0;
                            setDragOver(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) void processImageFile(file);
                          }
                        : undefined
                    }
                    onPaste={
                      imageOcrAvailable
                        ? (e) => {
                            const items = e.clipboardData?.items;
                            if (!items) return;
                            for (const item of items) {
                              if (
                                item.kind === "file" &&
                                item.type.startsWith("image/")
                              ) {
                                e.preventDefault();
                                const file = item.getAsFile();
                                if (file) void processImageFile(file);
                                return;
                              }
                            }
                          }
                        : undefined
                    }
                    placeholder={
                      imageOcrAvailable
                        ? "Paste notes or drag image…"
                        : "Paste notes…"
                    }
                    rows={12}
                    disabled={sending || extracting}
                  />
                  {imageOcrAvailable && (
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void processImageFile(file);
                      }}
                    />
                  )}
                  {ingestError && <p className="form-error">{ingestError}</p>}
                  <div className="actions">
                    {imageOcrAvailable && (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={sending || extracting}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {extracting ? "Extracting…" : "Upload image"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void sendNotes()}
                      disabled={!text.trim() || sending || extracting}
                    >
                      {sending ? "Sending…" : "Send"}
                    </button>
                  </div>
                </>
              )}
            </section>

            <section id="library" ref={libraryRef} className="block library">
              {folder || openNote ? (
                <button
                  type="button"
                  className="section-label section-label-btn"
                  onClick={() => goLibraryHome()}
                >
                  Library
                </button>
              ) : (
                <h2 className="section-label">Library</h2>
              )}
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
                          "--subj": subjectColor(openNote.subject, customSubjectColors),
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
                  {openNote.summary ? (
                    <p className="note-summary">{openNote.summary}</p>
                  ) : null}
                    <div
                      className="note-shell"
                      ref={noteShellRef}
                      style={
                        {
                          "--subj": subjectColor(openNote.subject, customSubjectColors),
                        } as CSSProperties
                      }
                    >
                      <div
                        key={`${openNote.id}:${openNote.html ? "html" : "ph"}`}
                        ref={mathHostRef}
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
                      onClick={() => openSubject(openNote.subject)}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={exportingPdf || !openNote.html}
                      onClick={() => void exportOpenNotePdf()}
                    >
                      {exportingPdf ? "Exporting…" : "Export PDF"}
                    </button>
                    {openNote.votes && (
                      <p className="model-votes muted">
                        Zero-shot: {openNote.votes.baseBert || "—"}
                        <span className="model-votes-sep" aria-hidden="true">
                          {" "}
                          ·{" "}
                        </span>
                        Fine-tuned: {openNote.votes.fineTunedBert || "—"}
                        <span className="model-votes-sep" aria-hidden="true">
                          {" "}
                          ·{" "}
                        </span>
                        GPT: {openNote.votes.gptOss || "—"}
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
                        "--subj": subjectColor(folder, customSubjectColors),
                      } as CSSProperties
                    }
                  >
                    {folder}
                  </h1>
                  <div className="note-list">
                    {folderNotes.length === 0 ? (
                      <p className="muted">No notes yet</p>
                    ) : (
                      folderNotes.map((n) => {
                        const uploaded = formatUploadedDate(n.createdAt);
                        return (
                          <button
                            key={n.id}
                            type="button"
                            className="note-item"
                            style={
                              {
                                "--subj": subjectColor(n.subject, customSubjectColors),
                              } as CSSProperties
                            }
                            onClick={() => openNoteAt(folder, n.title)}
                          >
                            <span className="note-item-title">{n.title}</span>
                            {uploaded ? (
                              <span className="note-item-date">{uploaded}</span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => goLibraryHome()}
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
                              "--subj": subjectColor(name, customSubjectColors),
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
                                "--subj": subjectColor(name, customSubjectColors),
                              } as CSSProperties
                            }
                            onClick={() => openSubject(name)}
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

        :global(.btn.gate-secondary),
        .btn.gate-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          background: color-mix(in srgb, var(--ink) 7%, transparent);
          color: var(--ink);
          box-shadow: inset 0 0 0 1.5px
            color-mix(in srgb, var(--accent) 35%, transparent);
        }

        :global(.btn.gate-secondary:hover),
        .btn.gate-secondary:hover {
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

        .section-label-btn {
          display: block;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 0;
          cursor: pointer;
          text-align: left;
        }

        .section-label-btn:hover {
          color: var(--accent);
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

        textarea.drag-over {
          box-shadow: 0 0 0 2px
            color-mix(in srgb, var(--accent) 45%, transparent);
          background: color-mix(in srgb, var(--accent) 8%, var(--surface));
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
          margin-top: 1rem;
          align-items: center;
        }

        .actions-sent {
          justify-content: flex-end;
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

        .model-votes-sep {
          font-weight: 900;
          font-size: 1.55em;
          line-height: 1;
          color: var(--ink);
          vertical-align: -0.06em;
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
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.2rem;
          width: 100%;
          text-align: left;
          border: 0;
          background: var(--surface);
          padding: 0.85rem 1rem;
          border-radius: var(--radius);
          cursor: pointer;
          box-shadow: inset 3px 0 0 var(--subj);
        }

        .note-item-title {
          font: inherit;
          color: inherit;
        }

        .note-item-date {
          font-size: 0.75rem;
          line-height: 1.2;
          color: var(--mute);
        }

        .note-item:hover {
          background: color-mix(in srgb, var(--subj, var(--accent)) 8%, var(--surface));
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

        .note-summary {
          margin: 0 0 1rem;
          color: var(--mute);
          font-size: 0.95rem;
          line-height: 1.5;
          max-width: 42rem;
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
          padding: 0.5rem 0.7rem;
          background: color-mix(
            in srgb,
            var(--subj, var(--accent)) 10%,
            var(--surface)
          );
          border-radius: calc(var(--radius) - 2px);
        }

        .note-shell :global(.eq:not(:has(.katex))) {
          font-family: ui-monospace, monospace;
        }

        .note-shell :global(.katex-display) {
          margin: 0.65rem 0;
          overflow-x: auto;
          overflow-y: hidden;
        }
      `}</style>
    </>
  );
}
