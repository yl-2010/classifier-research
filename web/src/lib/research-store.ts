import { INITIAL_RESEARCH, type ResearchRow } from "@/lib/atelier-data";

const KEY = "notelms-research";

export function loadResearch(): ResearchRow[] {
  if (typeof window === "undefined") return INITIAL_RESEARCH;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return INITIAL_RESEARCH;
    const parsed = JSON.parse(raw) as ResearchRow[];
    return Array.isArray(parsed) ? parsed : INITIAL_RESEARCH;
  } catch {
    return INITIAL_RESEARCH;
  }
}

export function saveResearch(rows: ResearchRow[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(rows));
}
