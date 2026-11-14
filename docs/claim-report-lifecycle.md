# Linked claim/report lifecycle

Student claim transitions use `src/lib/claim-transition-service.ts`. Route
handlers authenticate staff or the student owner before calling the service.

| Action | Claim | Linked lost report |
| --- | --- | --- |
| Student submits a linked claim | Pending | Matched to that item |
| Admin rejects that pending claim | Rejected; reference retained for history | Pending; item/review fields cleared |
| Student cancels that pending claim | Deleted | Pending; item/review fields cleared |
| Student resubmits a rejected claim | Pending with updated explanation/evidence | Matched to the same available item |

Rejection/cancellation release a report only when it is a Lost report owned by
the claimant, is currently Matched to that claim's item, and has no other active
claim. Closed, reassigned, foreign, and Found reports are never reopened by a
stale historical reference.

Resubmission requires available inventory, no competing active claim for that
student/item, and a still-pending, unassigned report owned by the student. If a
newer active claim uses the report, the old claim cannot take it back. An
unlinked claim remains unlinked.

All related writes are transactional. Transactions lock item then claim and
re-read current state before conditional writes. A failure rolls back both
claim and report changes. Approval also conditionally requires Pending status
so it cannot overwrite a rejection/cancellation committed while it waited.

The admin queue hides a Matched lost row only when a Pending/Approved claim
represents it. Rejected history must not hide a restored Pending report.
Student caches are invalidated after cancellation/resubmission.

These changes do not backfill or repair existing database records. Any
historical orphaned matches need a separately reviewed repair; do not blindly
reset all Matched reports to Pending. Tests use a locking transaction double,
not a live database. Approval's existing policy for other students' reports is
unchanged by this step.
