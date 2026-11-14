/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
const { validation, png } = require("./helpers/image-validation.cjs");

function load(file, dependencies) {
  dependencies = { "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => null }, ...dependencies };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, File, console, require(id) { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; } });
  return exports;
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(part => matches(row, part));
    if (key === "NOT") return !matches(row, value);
    if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
    if (value && typeof value === "object" && "is" in value) return value.is === null && !row[key];
    return row[key] === value;
  });
}

/** A serializing transaction double with rollback; not a live PostgreSQL test. */
function harness(options = {}) {
  const report = (id, userId) => ({ id, userId, itemName: "Lost bottle", description: "Blue sticker", category: "Water Bottles", location: "Library", date: new Date("2026-11-13"), imageUrl: png, imageUrls: [png], type: "LOST", status: "PENDING", itemId: null });
  let state = {
    items: [{ id: "item-1", itemName: "Bottle one", status: "FOUND", lockerId: null }, { id: "item-2", itemName: "Bottle two", status: "FOUND", lockerId: null }],
    claims: [{ id: "claim-1", itemId: "item-1", userId: "student-a", status: "PENDING", matchedReportId: null }, { id: "claim-2", itemId: "item-1", userId: "student-b", status: "PENDING", matchedReportId: null }],
    reports: [report("report-1", "student-a"), report("report-2", "student-b")],
    lockers: [{ id: "locker-1", lockerNumber: "A01", status: "AVAILABLE" }, { id: "locker-2", lockerNumber: "A02", status: "AVAILABLE" }],
    users: ["student-a", "student-b", "student-c"].map(id => ({ id, isActive: true, role: "STUDENT" })),
    ...options.state,
  };
  let tail = Promise.resolve(); let hookUsed = false;
  const queries = []; const writes = []; const notifications = [];
  const itemView = id => { const item = state.items.find(row => row.id === id); return item ? structuredClone({ ...item, locker: state.lockers.find(row => row.id === item.lockerId) || null }) : null; };
  const claimView = id => { const claim = state.claims.find(row => row.id === id); return claim ? structuredClone({ ...claim, item: itemView(claim.itemId) }) : null; };
  const lockerView = where => { const row = state.lockers.find(row => matches(row, where)); return row ? structuredClone({ ...row, item: state.items.find(item => item.lockerId === row.id) || null }) : null; };
  const readClaim = { findUnique: async ({ where }) => claimView(where.id), findFirst: async ({ where }) => structuredClone(state.claims.find(row => matches(row, where)) || null) };
  const readReport = { findUnique: async ({ where }) => structuredClone(state.reports.find(row => matches(row, where)) || null), findFirst: async ({ where }) => structuredClone(state.reports.find(row => matches(row, where)) || null) };
  const prisma = {
    claim: readClaim, report: readReport, item: { findUnique: async ({ where }) => itemView(where.id) },
    notification: { create: async ({ data }) => { notifications.push(data); } },
    async $transaction(fn) {
      let release; let snapshot; let locked = false;
      async function acquire() {
        if (locked) return;
        const previous = tail; tail = new Promise(resolve => { release = resolve; }); await previous;
        locked = true;
        if (options.onLock && !hookUsed) { hookUsed = true; options.onLock(state); }
        snapshot = structuredClone(state);
      }
      async function update(table, { where, data }) {
        assert.equal(locked, true);
        if (options.failWrite === table) throw new Error(`Simulated ${table} write failure`);
        const rows = state[table].filter(row => matches(table === "lockers" ? lockerView({ id: row.id }) : row, where));
        rows.forEach(row => Object.assign(row, data)); writes.push({ table, data: structuredClone(data), count: rows.length });
        return { count: rows.length };
      }
      const tx = {
        $queryRaw: async (strings, id) => {
          await acquire(); const sql = strings.join("?"); queries.push(sql);
          if (sql.includes('FROM "lockers" l')) {
            const locker = state.lockers.find(row => row.status === "AVAILABLE" && !state.items.some(item => item.lockerId === row.id));
            return locker ? [{ id: locker.id }] : [];
          }
          const table = sql.includes('"items"') ? "items" : sql.includes('"claims"') ? "claims" : sql.includes('"reports"') ? "reports" : "lockers";
          const row = state[table].find(row => row.id === id);
          if (table === "items" && sql.includes("AND status = 'FOUND'") && row?.status !== "FOUND") return [];
          return row ? [{ id }] : [];
        },
        item: { findUnique: async ({ where }) => itemView(where.id), updateMany: args => update("items", args) },
        user: { findUnique: async ({ where }) => structuredClone(state.users.find(row => row.id === where.id) || null) },
        locker: { findUnique: async ({ where }) => lockerView(where), updateMany: args => update("lockers", args) },
        claim: {
          ...readClaim, findUniqueOrThrow: async ({ where }) => { const row = claimView(where.id); assert.ok(row); return row; },
          findMany: async ({ where }) => structuredClone(state.claims.filter(row => matches(row, where))),
          updateMany: args => update("claims", args),
          create: async ({ data }) => {
            assert.equal(locked, true);
            if (options.failCreate) throw { code: "P2002" };
            const row = { id: `new-claim-${state.claims.length + 1}`, status: "PENDING", ...data };
            state.claims.push(row); return structuredClone(row);
          },
          deleteMany: async ({ where }) => { const before = state.claims.length; state.claims = state.claims.filter(row => !matches(row, where)); return { count: before - state.claims.length }; },
        },
        report: {
          ...readReport, findMany: async ({ where }) => structuredClone(state.reports.filter(row => matches(row, where))),
          updateMany: args => update("reports", args),
          findUniqueOrThrow: async ({ where }) => { const row = state.reports.find(row => matches(row, where)); assert.ok(row); return structuredClone(row); },
        },
      };
      try { return await fn(tx); }
      catch (error) { if (snapshot) state = snapshot; throw error; }
      finally { release?.(); }
    },
  };
  const review = load("src/lib/claim-review-service.ts", { "./prisma": { prisma }, "./image-validation": validation, "./report-include": { REPORT_INCLUDE: {} }, "node:crypto": crypto });
  const transition = load("src/lib/claim-transition-service.ts", { "./prisma": { prisma }, "./claim-report-link": load("src/lib/claim-report-link.ts", {}), "./claim-validation": load("src/lib/claim-validation.ts", {}) });
  function routes(user = { id: "admin", role: "ADMIN" }) {
    const deps = {
      "next/server": { NextResponse: Response }, "@/lib/prisma": { prisma }, "@/lib/auth": { authenticateRequest: async () => user },
      "@/lib/claim-review-service": review, "@/lib/claim-transition-service": transition, "@/lib/image-validation": validation,
      "@/lib/claim-validation": { NO_PHOTO_REASON_MIN_LENGTH: 80 },
      "@/lib/notification-service": { notifyUser: async (...args) => notifications.push(args), notifyUsers: async rows => notifications.push(...rows) },
      "@/lib/photo-gallery": load("src/lib/photo-gallery.ts", {}), "@/lib/image-url": { signedImageUrl: () => "" },
    };
    return {
      claim: load("src/app/api/claims/[id]/route.ts", deps), match: load("src/app/api/claims/match/route.ts", deps),
      submit: load("src/app/api/claims/route.ts", deps),
    };
  }
  return { review, transition, routes, state: () => structuredClone(state), queries, writes, notifications };
}
const context = id => ({ params: Promise.resolve({ id }) });
const request = body => ({ headers: { get: () => "application/json" }, json: async () => body });

test("two admins approving rival claims have one winner and reject the remaining pending claim", async () => {
  const h = harness();
  const results = await Promise.allSettled([h.review.approvePendingClaim("claim-1", "admin", {}), h.review.approvePendingClaim("claim-2", "admin", {})]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(h.state().claims.filter(row => row.status === "APPROVED").length, 1);
  assert.equal(h.state().claims.filter(row => row.status === "REJECTED").length, 1);
  assert.equal(h.state().items[0].status, "CLAIMED");
});

test("admin matching and ordinary approval cannot both win the same item", async () => {
  const initial = harness().state(); initial.reports[0].userId = "student-c";
  const testHarness = harness({ state: initial });
  const results = await Promise.allSettled([testHarness.review.approvePendingClaim("claim-1", "admin", { lockerNumber: "A01" }), testHarness.review.matchLostReport("report-1", "item-1", "admin")]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(testHarness.state().claims.filter(row => row.status === "APPROVED").length, 1);
});

test("linked approval resolves its own and rival matched reports without changing other items", async () => {
  const initial = harness().state();
  for (let i = 0; i < 2; i++) {
    initial.claims[i].matchedReportId = initial.reports[i].id;
    initial.reports[i].status = "MATCHED"; initial.reports[i].itemId = "item-1";
  }
  initial.reports.push({ ...initial.reports[1], id: "other-item-report", itemId: "item-2" });
  const h = harness({ state: initial });
  const result = await h.review.approvePendingClaim("claim-1", "admin", {});
  assert.equal(result.matchedReports.length, 2);
  assert.equal(h.state().reports[0].status, "CLOSED");
  assert.equal(h.state().reports[1].status, "CLOSED");
  assert.equal(h.state().reports[2].status, "MATCHED");
  assert.equal(h.state().claims[1].status, "REJECTED");
});

test("approval refuses stale, foreign or multiply linked reports instead of overriding them", async () => {
  for (const change of [
    state => { state.reports[0].status = "CLOSED"; }, state => { state.reports[0].userId = "student-b"; },
    state => { state.reports[0].itemId = "item-2"; },
    state => { state.claims[1].matchedReportId = "report-1"; },
  ]) {
    const initial = harness().state(); initial.claims[0].matchedReportId = "report-1";
    initial.reports[0].status = "MATCHED"; initial.reports[0].itemId = "item-1"; change(initial);
    const h = harness({ state: initial }); const before = h.state();
    await assert.rejects(() => h.review.approvePendingClaim("claim-1", "admin", {}), error => error.status === 409);
    assert.deepEqual(h.state(), before);
  }
});

test("approval reads a changed locker assignment after locking, not from its old snapshot", async () => {
  const h = harness({ onLock: state => {
    state.items[0].lockerId = "locker-2";
    state.lockers[1].status = "OCCUPIED";
    state.lockers[0].status = "MAINTENANCE";
  } });
  assert.equal((await h.review.approvePendingClaim("claim-1", "admin", {})).locker, "A02");
  assert.equal(h.state().items[0].lockerId, "locker-2");
  assert.equal(h.state().lockers[0].status, "MAINTENANCE");
});

test("one lost report cannot be matched to two different inventory items", async () => {
  const h = harness({ state: { claims: [] } });
  const results = await Promise.allSettled([h.review.matchLostReport("report-1", "item-1", "admin"), h.review.matchLostReport("report-1", "item-2", "admin")]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(h.state().claims.length, 1);
  assert.equal(h.state().items.filter(row => row.status === "CLAIMED").length, 1);
  assert.equal(h.state().lockers.filter(row => row.status === "OCCUPIED").length, 1);
});

test("competing explicit locker allocations have one winner without corrupting the losing item", async () => {
  const initial = harness().state(); initial.claims[1].itemId = "item-2";
  const h = harness({ state: initial });
  const results = await Promise.allSettled([h.review.approvePendingClaim("claim-1", "admin", { lockerNumber: "A01" }), h.review.approvePendingClaim("claim-2", "admin", { lockerNumber: "A01" })]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(h.state().items.filter(row => row.lockerId === "locker-1").length, 1);
  assert.equal(h.state().items.filter(row => row.status === "FOUND").length, 1);
});

test("automatic allocation uses locked empty lockers and preserves office pickup if none are free", async () => {
  const h = harness({ state: { claims: [] } });
  const results = await Promise.all([h.review.matchLostReport("report-1", "item-1", "admin"), h.review.matchLostReport("report-2", "item-2", "admin")]);
  assert.notEqual(results[0].locker, results[1].locker);
  assert.ok(h.queries.some(sql => sql.includes("FOR UPDATE SKIP LOCKED") && sql.includes("NOT EXISTS")));
  const empty = harness({ state: { claims: [], lockers: [] } });
  assert.equal((await empty.review.matchLostReport("report-1", "item-1", "admin")).locker, null);
});

test("same-item existing lockers can be reused, but maintenance and inconsistent assignments are rejected", async () => {
  const initial = harness().state(); initial.items[0].lockerId = "locker-1"; initial.lockers[0].status = "OCCUPIED";
  const h = harness({ state: initial });
  assert.equal((await h.review.approvePendingClaim("claim-1", "admin", { lockerNumber: "A01" })).locker, "A01");
  initial.lockers[0].status = "MAINTENANCE";
  const bad = harness({ state: initial }); const before = bad.state();
  await assert.rejects(() => bad.review.approvePendingClaim("claim-1", "admin", {}), error => error.status === 409);
  assert.deepEqual(bad.state(), before);
});

test("moving to a new locker releases only the old allocation and preserves maintenance state", async () => {
  for (const status of ["OCCUPIED", "MAINTENANCE"]) {
    const initial = harness().state(); initial.items[0].lockerId = "locker-1"; initial.lockers[0].status = status;
    const h = harness({ state: initial });
    await h.review.approvePendingClaim("claim-1", "admin", { lockerNumber: "A02" });
    assert.equal(h.state().items[0].lockerId, "locker-2");
    assert.equal(h.state().lockers[0].status, status === "MAINTENANCE" ? "MAINTENANCE" : "AVAILABLE");
  }
});

test("stale report edits, reviews and existing active links abort matching before approving inventory", async () => {
  for (const onLock of [
    state => { state.reports[0].status = "CLOSED"; }, state => { state.reports[0].description = "Changed details"; },
    state => { state.reports[0].itemId = "item-2"; }, state => { state.claims.push({ id: "new", itemId: "item-2", userId: "student-a", matchedReportId: "report-1", status: "PENDING" }); },
  ]) {
    const h = harness({ state: { claims: [] }, onLock });
    await assert.rejects(() => h.review.matchLostReport("report-1", "item-1", "admin"), error => error.status === 409);
    assert.equal(h.state().items[0].status, "FOUND");
    assert.equal(h.state().claims.some(row => row.status === "APPROVED"), false);
  }
});

test("inactive students and verified finders cannot be approved or admin-matched", async () => {
  for (const onLock of [
    state => { state.users[0].isActive = false; },
    state => { state.reports.push({ id: "found", itemId: "item-1", userId: "student-a", type: "FOUND", status: "VERIFIED" }); },
  ]) {
    const a = harness({ onLock });
    await assert.rejects(() => a.review.approvePendingClaim("claim-1", "admin", {}), error => error.status === 409);
    const b = harness({ state: { claims: [] }, onLock });
    await assert.rejects(() => b.review.matchLostReport("report-1", "item-1", "admin"), error => error.status === 409);
  }
});

test("all review writes roll back on claim/report/item failures, including locker reservation", async () => {
  for (const failWrite of ["claims", "reports", "items"]) {
    const initial = harness().state(); initial.reports[1].status = "MATCHED"; initial.reports[1].itemId = "item-1";
    const h = harness({ state: initial, failWrite }); const before = h.state();
    await assert.rejects(() => h.review.approvePendingClaim("claim-1", "admin", { lockerNumber: "A01" }));
    assert.deepEqual(h.state(), before);
  }
  const h = harness({ state: { claims: [] }, failCreate: true }); const before = h.state();
  await assert.rejects(() => h.review.matchLostReport("report-1", "item-1", "admin"));
  assert.deepEqual(h.state(), before);
});

test("rejecting and approving the same pending claim cannot overwrite each other", async () => {
  for (const first of ["reject", "approve"]) {
    const h = harness();
    const operations = [() => h.transition.rejectPendingClaim("claim-1", null), () => h.review.approvePendingClaim("claim-1", "admin", {})];
    if (first === "approve") operations.reverse();
    const results = await Promise.allSettled(operations.map(fn => fn()));
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    const claim = h.state().claims.find(row => row.id === "claim-1");
    assert.equal(h.state().items[0].status, claim.status === "APPROVED" ? "CLAIMED" : "FOUND");
  }
});

test("legacy report reviews cannot detach active claims or overwrite a changed report", async () => {
  const h = harness();
  const state = h.state(); state.claims[0].matchedReportId = "report-1";
  const active = harness({ state }); const before = active.state();
  await assert.rejects(() => active.review.reviewUnclaimedReport("report-1", { status: "PENDING", itemId: null }, { status: "REJECTED", itemId: null }), error => error.status === 409);
  assert.deepEqual(active.state(), before);
  const stale = harness({ onLock: state => { state.reports[0].status = "CLOSED"; } });
  await assert.rejects(() => stale.review.reviewUnclaimedReport("report-1", { status: "PENDING", itemId: null }, { status: "MATCHED" }, "item-1"), error => error.status === 409);
});

test("double student submissions and a duplicate appearing after preflight produce only one active claim", async () => {
  const h = harness({ state: { claims: [] } });
  const r = h.routes({ id: "student-a", role: "STUDENT" });
  const body = { itemId: "item-1", claimReason: "My bottle", evidenceImageUrls: [png] };
  const results = await Promise.all([r.submit.POST(request(body)), r.submit.POST(request(body))]);
  assert.deepEqual(results.map(row => row.status).sort(), [201, 409]);
  assert.equal(h.state().claims.length, 1);
});

test("HTTP routes enforce admin permissions and send notifications only for committed winners", async () => {
  const h = harness(); const r = h.routes();
  const results = await Promise.all([r.claim.PATCH(request({ action: "approve" }), context("claim-1")), r.claim.PATCH(request({ action: "approve" }), context("claim-2"))]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  assert.equal(h.notifications.filter(row => Array.isArray(row) && row[1] === "Claim Approved").length, 1);
  const denied = h.routes({ id: "student-a", role: "STUDENT" });
  assert.equal((await denied.match.POST(request({ reportId: "report-1", itemId: "item-2" }))).status, 403);
});

test("unique/serialization conflicts return 409 and do not notify or leave partial matched inventory", async () => {
  const h = harness({ state: { claims: [] }, failCreate: true }); const before = h.state();
  const result = await h.routes().match.POST(request({ reportId: "report-1", itemId: "item-1" }));
  assert.equal(result.status, 409);
  assert.deepEqual(h.state(), before);
  assert.equal(h.notifications.length, 0);
});

test("match success preserves immediate approval and returns the committed locker", async () => {
  const h = harness({ state: { claims: [] } });
  const result = await h.routes().match.POST(request({ reportId: "report-1", itemId: "item-1" }));
  assert.equal(result.status, 201);
  const json = await result.json();
  assert.equal(json.data.status, "APPROVED");
  assert.equal(json.data.source, "MATCH");
  assert.equal(json.data.locker, "A01");
  assert.equal(h.state().reports[0].status, "CLOSED");
});

test("review endpoints reject malformed JSON and invalid locker/identifier types", async () => {
  const h = harness(); const r = h.routes();
  for (const body of [null, [], {}, { action: "approve", lockerNumber: {} }]) {
    assert.equal((await r.claim.PATCH(request(body), context("claim-1"))).status, 400);
  }
  for (const body of [null, [], {}, { itemId: {}, reportId: "report-1" }, { itemId: " ", reportId: "report-1" }]) {
    assert.equal((await r.match.POST(request(body))).status, 400);
  }
  const broken = { json: async () => { throw new SyntaxError("Invalid JSON"); } };
  assert.equal((await r.claim.PATCH(broken, context("claim-1"))).status, 400);
  assert.equal((await r.match.POST(broken)).status, 400);
  assert.equal(h.queries.length, 0);
});

test("database uniqueness, serialization and deadlock errors are classified without exposing database details", () => {
  const h = harness();
  for (const error of [{ code: "P2002" }, { code: "P2034" }, { code: "P2010", meta: { code: "40P01" } }, { code: "P2010", meta: { code: "40001" } }]) {
    assert.equal(h.review.isReviewWriteConflict(error), true);
  }
  assert.equal(h.review.isReviewWriteConflict(new Error("Unexpected database failure")), false);
});
