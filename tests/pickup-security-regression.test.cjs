/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");

function load(file, dependencies, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date, console, process: { env: { NODE_ENV: "test" } }, ...globals,
    require(id) { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; },
  });
  return exports;
}

/** Transaction double with item-row locking and rollback, not a live database. */
function pickupHarness(options = {}) {
  let state = {
    claim: options.claim === null ? null : { id: "claim-1", itemId: "item-1", userId: "student-1", status: "APPROVED", ...options.claim },
    item: { id: "item-1", itemName: "Blue bottle", status: "CLAIMED", lockerId: "locker-1", ...options.item },
    locker: { id: "locker-1", lockerNumber: "B03", status: "OCCUPIED", ...options.locker },
    user: { isActive: true, ...options.user },
    qr: options.qr === null ? null : {
      id: "qr-1", claimId: "claim-1", qrToken: "original-pickup-token", isUsed: false,
      expiresAt: new Date(Date.now() + 60_000), ...options.qr,
    },
  };
  let lockTail = Promise.resolve();
  let lockHookUsed = false;
  const events = [];
  const getClaim = () => state.claim ? structuredClone({
    ...state.claim, user: state.user,
    item: { ...state.item, locker: state.item.lockerId ? state.locker : null },
  }) : null;
  const getQr = where => {
    if (!state.qr) return null;
    for (const key of ["id", "qrToken", "claimId"]) if (where[key] !== undefined && state.qr[key] !== where[key]) return null;
    return structuredClone({ ...state.qr, claim: getClaim() });
  };
  const prisma = {
    async $transaction(fn) {
      let release;
      let snapshot;
      let ownsItem = false;
      const tx = {
        async $queryRaw(strings) {
          const sql = strings.join("?");
          if (sql.includes('"items"')) {
            const previous = lockTail;
            lockTail = new Promise(resolve => { release = resolve; });
            await previous;
            ownsItem = true;
            if (!lockHookUsed && options.onItemLock) { lockHookUsed = true; options.onItemLock(state); }
            snapshot = structuredClone(state);
            events.push("lock-item");
            return options.itemDisappeared ? [] : [{ id: state.item.id }];
          }
          assert.equal(ownsItem, true, "item must be locked before claim");
          events.push("lock-claim");
          return options.claimDisappeared || !state.claim ? [] : [{ id: state.claim.id }];
        },
        claim: { findUnique: async () => getClaim() },
        qrCode: {
          findUnique: async ({ where }) => getQr(where),
          findUniqueOrThrow: async ({ where }) => { const qr = getQr(where); assert.ok(qr); return qr; },
          create: async ({ data }) => {
            assert.equal(ownsItem, true);
            assert.equal(state.qr, null, "generation must not race into duplicate creation");
            state.qr = { id: "qr-new", isUsed: false, ...data };
            events.push("create-qr");
            return structuredClone(state.qr);
          },
          updateMany: async ({ where, data }) => {
            assert.equal(ownsItem, true);
            const qr = getQr(where);
            if (!qr || (where.isUsed !== undefined && qr.isUsed !== where.isUsed)) return { count: 0 };
            if (where.expiresAt?.gt && qr.expiresAt <= where.expiresAt.gt) return { count: 0 };
            if (where.expiresAt?.lte && qr.expiresAt > where.expiresAt.lte) return { count: 0 };
            if (data.isUsed && options.consumeConflict) return { count: 0 };
            if (data.qrToken && options.rotateConflict) return { count: 0 };
            Object.assign(state.qr, data);
            events.push(data.isUsed ? "consume-qr" : "rotate-qr");
            return { count: 1 };
          },
        },
        item: { updateMany: async ({ where, data }) => {
          assert.equal(ownsItem, true);
          if (options.itemConflict || state.item.status !== where.status || state.item.lockerId !== where.lockerId) return { count: 0 };
          Object.assign(state.item, data); events.push("collect-item"); return { count: 1 };
        } },
        locker: { updateMany: async ({ where, data }) => {
          assert.equal(ownsItem, true);
          if (options.lockerFailure) throw new Error("Simulated locker database failure");
          if (options.lockerConflict || state.locker.id !== where.id || state.locker.status !== where.status) return { count: 0 };
          Object.assign(state.locker, data); events.push("release-locker"); return { count: 1 };
        } },
      };
      try { return await fn(tx); }
      catch (error) { if (snapshot) state = snapshot; throw error; }
      finally { release?.(); }
    },
  };
  const service = load("src/lib/pickup-service.ts", { "./prisma": { prisma }, "node:crypto": crypto });
  return {
    ...service, events, state: () => structuredClone(state),
    owner: { id: "student-1", role: "STUDENT" },
    collect: extra => service.collectPickup({ token: "original-pickup-token", ...extra }),
  };
}

test("successful pickup consumes QR, retrieves item and frees its locker in one transaction", async () => {
  const h = pickupHarness();
  const result = await h.collect();
  assert.equal(result.claimId, "claim-1");
  assert.equal(result.locker, "B03");
  assert.equal(h.state().qr.isUsed, true);
  assert.equal(h.state().item.status, "RETRIEVED");
  assert.equal(h.state().item.lockerId, null);
  assert.equal(h.state().locker.status, "AVAILABLE");
  assert.equal(h.state().claim.status, "APPROVED", "pickup must not rewrite the approval record");
  assert.deepEqual(h.events, ["lock-item", "lock-claim", "consume-qr", "collect-item", "release-locker"]);
});

test("simultaneous pickups allow exactly one winner, including staff versus hardware", async () => {
  const h = pickupHarness();
  const results = await Promise.allSettled([
    h.collect(), h.collect({ expectedUserId: "student-1", expectedLockerNumber: "B03" }), h.collect(),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected" && result.reason.status === 410).length, 2);
  assert.equal(h.events.filter(event => event === "release-locker").length, 1);
});

test("expired, used, unapproved and already retrieved pickups cannot mutate state", async () => {
  for (const options of [
    { qr: { expiresAt: new Date(0) } }, { qr: { isUsed: true } },
    { claim: { status: "PENDING" } }, { claim: { status: "REJECTED" } },
    { item: { status: "RETRIEVED" } }, { item: { status: "FOUND" } }, { item: { status: "EXPIRED" } },
  ]) {
    const h = pickupHarness(options); const before = h.state();
    await assert.rejects(() => h.collect(), h.PickupError);
    assert.deepEqual(h.state(), before);
  }
});

test("hardware must match the student, locker, active account and occupied locker state", async () => {
  for (const [options, expected] of [
    [{}, { expectedUserId: "other-student", expectedLockerNumber: "B03" }],
    [{}, { expectedUserId: "student-1", expectedLockerNumber: "A01" }],
    [{ user: { isActive: false } }, { expectedUserId: "student-1", expectedLockerNumber: "B03" }],
    [{ locker: { status: "MAINTENANCE" } }, { expectedUserId: "student-1", expectedLockerNumber: "B03" }],
    [{ item: { lockerId: null } }, { expectedUserId: "student-1", expectedLockerNumber: "B03" }],
  ]) {
    const h = pickupHarness(options); const before = h.state();
    await assert.rejects(() => h.collect(expected), h.PickupError);
    assert.deepEqual(h.state(), before);
  }
});

test("state changed while waiting for the item lock is read again before pickup", async () => {
  for (const onItemLock of [
    state => { state.qr.isUsed = true; }, state => { state.qr.expiresAt = new Date(0); },
    state => { state.qr.qrToken = "replacement-token"; }, state => { state.item.status = "RETRIEVED"; },
    state => { state.claim.status = "REJECTED"; }, state => { state.item.lockerId = null; },
  ]) {
    const h = pickupHarness({ onItemLock });
    await assert.rejects(() => h.collect({ expectedLockerNumber: "B03" }), h.PickupError);
    assert.equal(h.events.includes("consume-qr"), false);
  }
});

test("QR, item and locker conflicts roll back the whole pickup, including unexpected errors", async () => {
  for (const options of [{ consumeConflict: true }, { itemConflict: true }, { lockerConflict: true }, { lockerFailure: true }]) {
    const h = pickupHarness(options); const before = h.state();
    await assert.rejects(() => h.collect());
    assert.deepEqual(h.state(), before);
  }
});

test("staff can collect an approved item without a locker; hardware cannot", async () => {
  const h = pickupHarness({ item: { lockerId: null } });
  assert.equal((await h.collect()).locker, null);
  assert.equal(h.state().item.status, "RETRIEVED");
  assert.equal(h.events.includes("release-locker"), false);
});

test("development dry-run validates without consuming QR or releasing a locker", async () => {
  const h = pickupHarness(); const before = h.state();
  await h.collect({ expectedUserId: "student-1", expectedLockerNumber: "B03", dryRun: true });
  assert.deepEqual(h.state(), before);
  assert.deepEqual(h.events, ["lock-item", "lock-claim"]);
});

test("QR generation returns the current valid QR unchanged", async () => {
  const h = pickupHarness(); const before = h.state();
  assert.equal((await h.generatePickupQr("claim-1", h.owner)).qrToken, before.qr.qrToken);
  assert.deepEqual(h.state(), before);
});

test("expired unused QRs rotate to a new token; the old token cannot collect", async () => {
  const h = pickupHarness({ qr: { expiresAt: new Date(0) } });
  const qr = await h.generatePickupQr("claim-1", h.owner);
  assert.notEqual(qr.qrToken, "original-pickup-token");
  assert.equal(qr.isUsed, false);
  assert.ok(qr.expiresAt.getTime() > Date.now() + 23 * 60 * 60 * 1000);
  await assert.rejects(() => h.collect(), error => error.status === 404);
  await h.collect({ token: qr.qrToken });
  assert.equal(h.state().item.status, "RETRIEVED");
});

test("concurrent generation creates one QR and returns the same token to both requests", async () => {
  const h = pickupHarness({ qr: null });
  const results = await Promise.all([h.generatePickupQr("claim-1", h.owner), h.generatePickupQr("claim-1", h.owner)]);
  assert.equal(results[0].qrToken, results[1].qrToken);
  assert.equal(h.events.filter(event => event === "create-qr").length, 1);
});

test("concurrent expired-QR renewal rotates only once", async () => {
  const h = pickupHarness({ qr: { expiresAt: new Date(0) } });
  const results = await Promise.all([h.generatePickupQr("claim-1", h.owner), h.generatePickupQr("claim-1", h.owner)]);
  assert.equal(results[0].qrToken, results[1].qrToken);
  assert.equal(h.events.filter(event => event === "rotate-qr").length, 1);
});

test("generation and collection cannot revive a consumed QR when racing", async () => {
  for (const generateFirst of [false, true]) {
    const h = pickupHarness();
    const operations = generateFirst
      ? [() => h.generatePickupQr("claim-1", h.owner), () => h.collect()]
      : [() => h.collect(), () => h.generatePickupQr("claim-1", h.owner)];
    await Promise.allSettled(operations.map(fn => fn()));
    assert.equal(h.state().qr.isUsed, true);
    assert.equal(h.state().item.status, "RETRIEVED");
    await assert.rejects(() => h.generatePickupQr("claim-1", h.owner), error => error.status === 409);
  }
});

test("QR generation fails closed for consumed QRs, collected items, wrong owners and disabled accounts", async () => {
  for (const [options, actor] of [
    [{ qr: { isUsed: true } }, { id: "student-1", role: "STUDENT" }],
    [{ item: { status: "RETRIEVED" } }, { id: "admin", role: "ADMIN" }],
    [{ claim: { status: "REJECTED" } }, { id: "student-1", role: "STUDENT" }],
    [{}, { id: "other-student", role: "STUDENT" }],
    [{}, { id: "someone", role: "UNKNOWN" }],
    [{ user: { isActive: false } }, { id: "student-1", role: "STUDENT" }],
  ]) {
    const h = pickupHarness(options); const before = h.state();
    await assert.rejects(() => h.generatePickupQr("claim-1", actor), h.PickupError);
    assert.deepEqual(h.state(), before);
  }
});

test("a staff account can generate QR only for an approved, collectable claim", async () => {
  const h = pickupHarness({ qr: null });
  assert.ok((await h.generatePickupQr("claim-1", { id: "admin", role: "ADMIN" })).qrToken);
});

test("missing records and conditional QR rotation failures return a conflict without changes", async () => {
  for (const options of [{ claim: null }, { itemDisappeared: true }, { claimDisappeared: true }, { qr: { expiresAt: new Date(0) }, rotateConflict: true }]) {
    const h = pickupHarness(options); const before = h.state();
    await assert.rejects(() => h.generatePickupQr("claim-1", h.owner), h.PickupError);
    assert.deepEqual(h.state(), before);
  }
});

function routes(h, { user = { id: "admin", role: "ADMIN" }, session = { userId: "student-1", deviceId: "locker-01", locker: "B03" }, production = false, configured = true, deviceValid = true } = {}) {
  const dependencies = {
    "next/server": { NextResponse: Response },
    "@/lib/auth": { authenticateRequest: async () => user }, "@/lib/pickup-service": h,
    "@/lib/hardware-auth": {
      UNLOCK_MS: 5000, isHardwareConfigured: () => configured,
      authenticateHardwareDevice: id => deviceValid && id === "locker-01" ? { deviceId: id, lockerNumber: "B03" } : null, readLockerSession: () => session,
    },
  };
  return {
    generate: load("src/app/api/qrcode/generate/route.ts", dependencies),
    staff: load("src/app/api/qrcode/verify/route.ts", dependencies),
    hardware: load("src/app/api/hardware/verify/route.ts", dependencies, { process: { env: { NODE_ENV: production ? "production" : "test" } } }),
  };
}
const request = (body = {}) => ({ headers: { get: () => "device-key" }, json: async () => body });
const hardwareBody = { token: "original-pickup-token", sessionToken: "signed-session", deviceId: "locker-01" };

test("HTTP staff and hardware endpoints share the same one-winner pickup transaction", async () => {
  const h = pickupHarness(); const r = routes(h);
  const results = await Promise.all([r.staff.POST(request({ token: "original-pickup-token" })), r.hardware.POST(request(hardwareBody))]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 410]);
});

test("anonymous users and students cannot use the staff pickup endpoint", async () => {
  for (const [user, status] of [[null, 401], [{ id: "student-1", role: "STUDENT" }, 403]]) {
    const h = pickupHarness(); const before = h.state(); const r = routes(h, { user });
    assert.equal((await r.staff.POST(request({ token: "original-pickup-token" }))).status, status);
    assert.deepEqual(h.state(), before);
    if (!user) assert.equal((await r.generate.POST(request({ claimId: "claim-1" }))).status, 401);
  }
});

test("QR routes reject malformed JSON and invalid identifiers before pickup writes", async () => {
  const h = pickupHarness(); const r = routes(h);
  for (const body of [null, [], {}, { token: 123, claimId: [] }, { token: " ", claimId: " " }, { token: "x".repeat(257), claimId: "x".repeat(129) }]) {
    assert.equal((await r.staff.POST(request(body))).status, 400);
    assert.equal((await r.generate.POST(request(body))).status, 400);
  }
  for (const route of [r.staff, r.generate, r.hardware]) {
    assert.equal((await route.POST({ ...request(), json: async () => { throw new SyntaxError("bad json"); } })).status, 400);
  }
  assert.equal(h.events.length, 0);
});

test("hardware rejects invalid configuration, credentials, sessions or device bindings before pickup", async () => {
  for (const [options, body, status] of [
    [{ configured: false }, hardwareBody, 500], [{ deviceValid: false }, hardwareBody, 401],
    [{ session: null }, hardwareBody, 401], [{}, { ...hardwareBody, sessionToken: "" }, 401],
    [{ session: { userId: "student-1", deviceId: "other-device", locker: "B03" } }, hardwareBody, 401],
    [{ session: { userId: "student-1", deviceId: "locker-01", locker: "A01" } }, hardwareBody, 401],
  ]) {
    const h = pickupHarness(); const r = routes(h, options);
    assert.equal((await r.hardware.POST(request(body))).status, status);
    assert.equal(h.events.length, 0);
  }
});

test("hardware dry-run does not consume in development but cannot bypass consumption in production", async () => {
  for (const production of [false, true]) {
    const h = pickupHarness(); const r = routes(h, { production });
    const result = await r.hardware.POST(request({ ...hardwareBody, dryRun: true }));
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.data.dryRun, !production);
    assert.equal(body.data.unlockMs, 5000);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(h.state().qr.isUsed, production);
  }
});

test("QR generation responses do not allow caching of pickup tokens", async () => {
  const h = pickupHarness(); const r = routes(h, { user: h.owner });
  const result = await r.generate.POST(request({ claimId: "claim-1" }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
});
