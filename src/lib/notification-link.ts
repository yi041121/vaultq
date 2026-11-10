/**
 * Report notifications use the same My Reports link. The report type is
 * inferred for older notifications that were saved before the link carried a
 * `kind` parameter, so Found/Lost notifications always open the right tab.
 */
export function resolveNotificationLink(
  link: string | null | undefined,
  title: string,
  message: string,
): string | null {
  if (!link) return null;
  if (!link.startsWith("/dashboard/student/report")) return link;
  if (/[?&]kind=(LOST|FOUND)(&|$)/.test(link)) return link;

  const text = `${title} ${message}`.toLowerCase();
  let kind: "LOST" | "FOUND" | null = null;
  if (text.includes("found item") || text.includes("found report")) kind = "FOUND";
  else if (text.includes("lost item") || text.includes("lost report")) kind = "LOST";
  if (!kind) return link;

  return `${link}${link.includes("?") ? "&" : "?"}kind=${kind}`;
}
