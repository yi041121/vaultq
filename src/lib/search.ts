// Shared text matching for the search inputs: case-insensitive, tolerant of
// extra whitespace, and matching across multiple fields (name, category,
// place, locker, date, ...). A query like " zhenYe " or "zhen ye" still finds
// "Zhen Ye".

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Lowercase and collapse whitespace so queries and fields compare cleanly. */
export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").toString().toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Searchable representations of a date: ISO, day/month/year, written month,
 * month + year, year and month number, so "2026", "feb 2026", "1 Feb 2026",
 * "01/02/2026" and "2026-02-01" all match.
 */
export function dateSearchValues(value: string | null | undefined): string[] {
  const raw = (value ?? "").toString().trim();
  if (!raw) return [];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return [raw];

  const day = date.getDate();
  const monthIndex = date.getMonth();
  const year = date.getFullYear();
  const short = MONTHS_SHORT[monthIndex];
  const long = MONTHS_LONG[monthIndex];
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;

  return [
    iso,
    `${day} ${short} ${year}`,
    `${day} ${long} ${year}`,
    `${short} ${day} ${year}`,
    `${long} ${day}, ${year}`,
    `${pad(day)}/${pad(monthIndex + 1)}/${year}`,
    `${short} ${year}`,
    `${long} ${year}`,
    `${pad(monthIndex + 1)}/${year}`,
    String(year),
  ];
}

/**
 * True when the query matches any of the given fields.
 * Every field is normalised, then matched with and without spaces so users can
 * type "e lectronics" or "zhen ye" and still find the record.
 */
export function matchesSearch(
  query: string | null | undefined,
  fields: Array<string | number | null | undefined>
): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;

  const haystack = normalizeSearch(
    fields.filter((field) => field !== null && field !== undefined && field !== "").join(" ")
  );
  if (haystack.includes(q)) return true;

  const compactQuery = q.replace(/\s+/g, "");
  if (!compactQuery) return true;
  return haystack.replace(/\s+/g, "").includes(compactQuery);
}
