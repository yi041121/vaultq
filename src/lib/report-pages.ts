/** Follow bounded API pages so older reports are not silently hidden. */
export async function fetchReportPages(url: string, token: string, signal?: AbortSignal): Promise<Response> {
  const records: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const separator = url.includes("?") ? "&" : "?";
    const pageUrl: string = cursor ? `${url}${separator}cursor=${encodeURIComponent(cursor)}` : url;
    const response: Response = await fetch(pageUrl, { headers: { "X-VaultQ-Session": token, "X-VaultQ-Request": "1" }, cache: "no-store", signal });
    if (!response.ok) return response;
    const body: { success?: boolean; data?: unknown; pagination?: { nextCursor?: unknown } } = await response.json();
    if (!body?.success || !Array.isArray(body.data)) return Response.json({ success: false, error: "Invalid report list response" }, { status: 502 });
    records.push(...body.data);
    cursor = typeof body.pagination?.nextCursor === "string" ? body.pagination.nextCursor : null;
    if (cursor) {
      if (seen.has(cursor)) throw new Error("Report pagination did not advance. Please refresh.");
      seen.add(cursor);
    }
  } while (cursor);
  return Response.json({ success: true, data: records });
}
