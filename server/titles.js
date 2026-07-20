/**
 * Note title helpers — slugify + ensure unique titles across a user's library.
 */

export function slugifyLabel(label) {
  return (
    String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "note"
  );
}

/**
 * Return `baseTitle`, or `baseTitle 2`, `baseTitle 3`, … so the display title
 * and its URL slug are unique among `existingTitles`.
 */
export function uniquifyTitle(baseTitle, existingTitles = []) {
  const base = String(baseTitle || "").trim() || "Untitled note";
  const takenTitles = new Set(
    existingTitles
      .map((t) => String(t || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const takenSlugs = new Set(
    existingTitles.map((t) => slugifyLabel(t)).filter(Boolean)
  );

  for (let n = 1; n <= 1000; n += 1) {
    const candidate = n === 1 ? base : `${base} ${n}`;
    const slug = slugifyLabel(candidate);
    if (
      !takenTitles.has(candidate.toLowerCase()) &&
      !takenSlugs.has(slug)
    ) {
      return candidate;
    }
  }

  return `${base} ${Date.now()}`;
}
