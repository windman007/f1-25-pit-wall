// Dashboard arrangement: which sections sit in which column, top to bottom ({cols: [[id, ...], ...]}), and which
// of them are hidden. A hidden section keeps its place, so showing it again puts it back where it was.

export interface Arrangement {
  cols: string[][];
  /** Sections left off the dashboard; never all of them. Absent when none are. */
  hidden?: string[];
}
export const MAX_COLS = 4;

const withHidden = (cols: string[][], hidden: string[] | undefined): Arrangement => (hidden?.length ? {cols, hidden: [...hidden]} : {cols});
const copy = (a: Arrangement): Arrangement => withHidden(a.cols.map(c => [...c]), a.hidden);

/**
 * A saved arrangement checked against the sections the page has: every section exactly once (unknown ones and
 * repeats dropped, missing ones added to the last column), no empty columns, at most MAX_COLS. Unusable: the fallback.
 * Hidden: known sections only, in `ids` order; if that would hide everything, nothing is hidden.
 */
export function normalizeArrangement(saved: unknown, ids: string[], fallback: Arrangement): Arrangement {
  const cols0 = saved && typeof saved === 'object' ? (saved as {cols?: unknown}).cols : null;
  const hidden0 = saved && typeof saved === 'object' ? (saved as {hidden?: unknown}).hidden : null;
  if (!Array.isArray(cols0)) return copy(fallback);
  const seen = new Set<string>();
  const keep = (id: unknown): id is string => {
    if (typeof id !== 'string' || !ids.includes(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  const cols = cols0
    .filter(Array.isArray)
    .map((c: unknown[]) => c.filter(keep))
    .filter(c => c.length)
    .slice(0, MAX_COLS);
  if (!cols.length) return copy(fallback);
  const placed = new Set(([] as string[]).concat(...cols));
  cols[cols.length - 1].push(...ids.filter(id => !placed.has(id)));
  const hidden = Array.isArray(hidden0) ? ids.filter(id => hidden0.includes(id)) : [];
  return withHidden(cols, hidden.length < ids.length ? hidden : []);
}

/**
 * The arrangement with section `id` moved to column `col` at `index`, counted without the moved section.
 * Empty columns are kept: while editing, an empty column is a place to drop a section.
 */
export function moveSection(arr: Arrangement, id: string, col: number, index: number): Arrangement {
  const cols = arr.cols.map(c => c.filter(x => x !== id));
  if (!cols[col]) return copy(arr);
  cols[col].splice(Math.max(0, Math.min(index, cols[col].length)), 0, id);
  return withHidden(cols, arr.hidden);
}

/** The arrangement with section `id` hidden, or shown again. The last section on show stays shown. */
export function toggleHidden(arr: Arrangement, id: string): Arrangement {
  const hidden = arr.hidden ?? [];
  if (hidden.includes(id)) return withHidden(arr.cols.map(c => [...c]), hidden.filter(x => x !== id));
  const all = ([] as string[]).concat(...arr.cols);
  if (!all.includes(id) || all.every(x => x === id || hidden.includes(x))) return copy(arr);
  return withHidden(arr.cols.map(c => [...c]), all.filter(x => x === id || hidden.includes(x)));
}

/** Whether two arrangements put the sections in the same places (whatever is hidden). */
export const samePlaces = (a: Arrangement, b: Arrangement): boolean => JSON.stringify(a.cols) === JSON.stringify(b.cols);

export const sameArrangement = (a: Arrangement, b: Arrangement): boolean => JSON.stringify(a) === JSON.stringify(b);
