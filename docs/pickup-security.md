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

## Per-device enrolment (deployment configuration required)

Set a server-only `HARDWARE_DEVICES` environment variable containing JSON:

```json
[
  { "deviceId": "locker-01", "lockerNumber": "B03", "apiKey": "GENERATE_A_UNIQUE_RANDOM_KEY_AT_LEAST_32_CHARS" },
  { "deviceId": "locker-02", "lockerNumber": "A01", "apiKey": "GENERATE_ANOTHER_UNIQUE_RANDOM_KEY_32_OR_MORE_CHARS" }
]
```

The examples are placeholders, not usable production credentials. Generate a
different cryptographically random key for each device, for example with
`openssl rand -hex 32`. Configure `HARDWARE_SESSION_SECRET` as a separate random
server-only secret of at least 32 characters. Do not put it into device firmware
or `NEXT_PUBLIC_*`. Never commit real keys or the registry to source control.

Both identify and verify requests must include their enrolled `deviceId` and
that device's key in `x-device-key`. Request bodies cannot select a different
locker. Keys cannot authenticate another device ID. IDs, keys and locker numbers
must be unique within the registry. Malformed/ambiguous configuration, weak keys,
unknown devices or missing IDs fail closed. Device sessions are HS256-signed,
issuer/audience-bound, short-lived and checked against the current registry.

`HARDWARE_API_KEY` and `LOCKER_NUMBER` are no longer read. Configure the registry
and update any device that omitted `deviceId` **before deploying** this version.
For a single existing device, enrol its actual ID, key and locker explicitly;
rotate keys shorter than 32 characters. There is no implicit `B03` assignment.

Removing a device or changing its locker invalidates its prior locker sessions.
Rotate a compromised device's key independently. The credential must still be
presented on every verify request; a locker session alone is insufficient.

This registry change does not add physical door acknowledgement or automatically
recover an ambiguous pickup. The physical-device limitations above still apply.
