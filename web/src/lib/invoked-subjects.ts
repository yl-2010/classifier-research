import { FIXED_SUBJECTS, sortLibrarySubjects } from "@/lib/atelier-data";

const KEY = "notelms-invoked-subjects";

/** Subjects the user manually added to the library (even with zero notes). */
export function loadInvokedSubjects(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortLibrarySubjects(
      parsed.filter((s): s is string => typeof s === "string")
    );
  } catch {
    return [];
  }
}

export function saveInvokedSubjects(labels: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(sortLibrarySubjects(labels)));
}

export function availableFixedToAdd(invoked: string[]): string[] {
  const have = new Set(invoked.map((s) => s.toLowerCase()));
  return FIXED_SUBJECTS.filter((s) => !have.has(s.toLowerCase()));
}
