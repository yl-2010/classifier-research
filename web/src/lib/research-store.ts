import { type ResearchRow } from "@/lib/atelier-data";

const KEY = "notelms-research";

export function loadResearch(): ResearchRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ResearchRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveResearch(rows: ResearchRow[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(rows));
}
