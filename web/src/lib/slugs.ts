/** URL slug for a subject or note title (e.g. "Computer Science" → "computer-science"). */
export function slugify(label: string): string {
  return (
    String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "note"
  );
}

export function subjectPath(subject: string): string {
  return `/${slugify(subject)}`;
}

export function notePath(subject: string, title: string): string {
  return `/${slugify(subject)}/${slugify(title)}`;
}

export function findLabelBySlug(
  labels: Iterable<string>,
  slug: string
): string | null {
  const needle = slugify(slug);
  for (const label of labels) {
    if (slugify(label) === needle) return label;
  }
  return null;
}

export function findNoteBySlug<T extends { title: string }>(
  notes: T[],
  slug: string
): T | null {
  const needle = slugify(slug);
  return notes.find((n) => slugify(n.title) === needle) ?? null;
}
