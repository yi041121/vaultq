/** Display only: keep ISO values unchanged in forms, filters and API payloads. */
export function formatDisplayDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDisplayTimestamp(value: string | null | undefined): string {
  const day = formatDisplayDate(value);
  if (day === "—") return day;
  const time = new Date(value!).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day} · ${time}`;
}
