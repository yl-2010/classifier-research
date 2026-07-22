/** Fixed 8-subject taxonomy (BERT labels). Custom subjects are user-added. */
export const FIXED_SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "History",
  "Literature",
  "Economics",
] as const;

export type FixedSubject = (typeof FIXED_SUBJECTS)[number];

export const SUBJECTS: [string, string][] = [
  ["Mathematics", "#2563eb"],
  ["Physics", "#4f46e5"],
  ["Chemistry", "#d97706"],
  ["Biology", "#059669"],
  ["Computer Science", "#0891b2"],
  ["History", "#a16207"],
  ["Literature", "#be123c"],
  ["Economics", "#0d9488"],
];

export const SUBJECT_COLORS = Object.fromEntries(SUBJECTS) as Record<
  string,
  string
>;

const CUSTOM_SUBJECT_COLOR = "#64748b";

/** Color for a fixed or custom subject label. */
export function subjectColor(
  name: string,
  customColors?: Record<string, string> | null
): string {
  if (SUBJECT_COLORS[name]) return SUBJECT_COLORS[name];
  if (customColors) {
    const exact = customColors[name];
    if (exact) return exact;
    const lower = name.toLowerCase();
    for (const [label, hex] of Object.entries(customColors)) {
      if (label.toLowerCase() === lower && hex) return hex;
    }
  }
  return CUSTOM_SUBJECT_COLOR;
}

export function isFixedSubject(label: string): boolean {
  return (FIXED_SUBJECTS as readonly string[]).includes(label);
}

/** Sort: fixed taxonomy order first, then custom alphabetically. */
export function sortLibrarySubjects(labels: Iterable<string>): string[] {
  const set = new Set(
    [...labels].map((s) => s.trim()).filter((s) => s && s !== "Other")
  );
  const fixed = FIXED_SUBJECTS.filter((s) => set.has(s));
  const custom = [...set]
    .filter((s) => !isFixedSubject(s))
    .sort((a, b) => a.localeCompare(b));
  return [...fixed, ...custom];
}

export type NoteStatus = "processing" | "ready";

export type ModelVotes = {
  gptOss: string | null;
  baseBert: string | null;
  fineTunedBert: string | null;
};

export type NoteItem = {
  id: string;
  title: string;
  subject: string;
  status: NoteStatus;
  html: string;
  orchestrator: string;
  corrected: boolean;
  votes: ModelVotes | null;
  /** ISO upload/create time; used for list sort and date label. */
  createdAt?: string;
  /** 1–2 sentence GPT-OSS summary from ingest. */
  summary?: string;
};

export type ResearchRow = {
  id: string;
  when: string;
  orchestrator: string;
  final: string;
  corrected: boolean;
};
