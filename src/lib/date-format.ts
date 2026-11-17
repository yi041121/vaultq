/** Display only: keep ISO values unchanged in forms, filters and API payloads. */
export function formatDisplayDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Display-only clock value. Empty/invalid values return an empty string. */
export function formatDisplayTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatDisplayTimestamp(value: string | null | undefined): string {
  const day = formatDisplayDate(value);
  if (day === "—") return day;
  return `${day} · ${formatDisplayTime(value)}`;
}

/** Date + time where the time may be omitted, e.g. "13 Nov 2026 · 1:05 pm". */
export function formatDisplayDateTime(value: string | Date | null | undefined): string {
  const day = formatDisplayDate(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return day;
  const time = formatDisplayTime(value);
  return time ? `${day} · ${time}` : day;
}
