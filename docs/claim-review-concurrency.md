# Approval and matching concurrency

`src/lib/claim-review-service.ts` owns ordinary approval and immediate admin
matching. Routes authenticate the administrator first and send notifications
only after the review transaction commits.

## Guarantees in the reviewed flows

- Review transactions lock the item and re-read availability. Approval also
  locks/re-reads the claim; matching locks/re-reads the lost report.
- A stale Pending snapshot cannot overwrite rejection, cancellation, another
  match, or approval of another student.
- Report details/photos are normalized outside the matching transaction. A
  revision hash must still match the report read under lock before approval.
- Student submissions repeat duplicate/finder checks under the same item lock.
  Report linking is a conditional update, preventing two items from taking the
  same pending report.
- Explicit locker allocations validate the current locker and its actual item
  relation under lock. Existing item lockers are reused only when consistent.
- Automatic matches select an empty Available locker using `FOR UPDATE SKIP
  LOCKED`. Moves lock old/new lockers in sorted order, and do not accidentally
  make a maintenance locker Available.
- Item, claim, report, and locker writes commit or roll back together. Expected
  uniqueness/serialization conflicts return 409 and require refresh, not a false
  success notification.
- Legacy report-only reviews cannot detach a report used by an active claim.
  Student edits/withdrawals conditionally require Pending state at write time.

## Existing policies retained

Admin matching is immediate approval. Ordinary approval does not automatically
allocate a locker. A match may still approve for office pickup if there is no
free locker. Other pending claims for the winning item are rejected, and lost
reports matched to that item are closed, as before. These ownership/resolution
policies are separate from the locking protections and can be discussed or
changed independently.

No schema migration or production data repair is part of this step. Tests use
transaction doubles with locking/rollback, not a live PostgreSQL instance.
Before release, verify concurrent staff reviews against a staging database,
including explicit locker contention and parallel automatic allocation.
