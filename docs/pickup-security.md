# QR pickup security

QR generation, staff verification, and hardware verification use
`src/lib/pickup-service.ts`. Route handlers authenticate the caller before
invoking the service.

## Invariants

- Only an approved claim for a `CLAIMED` item can have a usable pickup QR.
- Only the student who owns the claim or an authenticated administrator can
  request that QR. The student account must still be active.
- Generation and collection lock the item first, then the claim, and re-read
  state after acquiring the locks. Keep this lock order in future workflows.
- An expired, unused QR is renewed with a new unpredictable token. The old
  token no longer works. A used QR is never reset automatically.
- Staff and hardware collection share one transaction. Consuming the token,
  setting the item to `RETRIEVED`, and releasing the locker either all commit
  or all roll back. Conditional writes provide additional conflict checks.
- Hardware pickup also requires the scanned student's session and the QR's
  current locker assignment to match the authenticated device's flow.
- Development dry-runs validate without writes. Production ignores `dryRun`
  and performs normal one-time consumption.
- QR and pickup responses use `Cache-Control: no-store`.

## Physical-device boundary

The database transaction grants pickup permission; it does not prove that a
physical door opened or that the student removed the item. A device/network
failure after commit must not silently revive the QR. Staff must investigate
before any recovery. An audited recovery/device-acknowledgment workflow is a
separate feature; do not work around failures by resetting `isUsed` manually.

The regression tests exercise authorization, replay, rotation, rollback, and
simultaneous operations using a transaction double with locking. They do not
operate a physical locker or validate a live database deployment. Before
release, also run staging tests with concurrent staff/device scans, an expired
QR renewal, a lost device response, and a failed physical unlock.
