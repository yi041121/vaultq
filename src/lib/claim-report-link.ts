export const ACTIVE_CLAIM_STATUSES = ["PENDING", "APPROVED"] as const;

/** Rejected claims retain their report reference for history, not ownership. */
export function activeLinkedReportIds(claims: readonly { status: string; matchedReportId?: string | null }[]): Set<string> {
  return new Set(claims.flatMap((claim) =>
    (claim.status === "PENDING" || claim.status === "APPROVED") && claim.matchedReportId ? [claim.matchedReportId] : [],
  ));
}
