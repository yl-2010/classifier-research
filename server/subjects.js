/** Fixed 8-subject taxonomy (BERT labels). Orchestrator may also use Other / custom. */

export const FIXED_SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "History",
  "Literature",
  "Economics",
];

export const OTHER_SUBJECT = "Other";

export function isFixedSubject(label) {
  return FIXED_SUBJECTS.includes(label);
}

export function normalizeSubjectLabel(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  for (const s of FIXED_SUBJECTS) {
    if (s.toLowerCase() === lower) return s;
  }
  if (lower === "other") return OTHER_SUBJECT;
  return trimmed;
}
