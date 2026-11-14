/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const crypto = require("node:crypto");
const { validation, png } = require("./helpers/image-validation.cjs");

function load(file, dependencies = {}) {
  dependencies = { "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => null }, ...dependencies };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date, File, console,
    require(id) { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; },
  });
  return exports;
}

const links = load("src/lib/claim-report-link.ts");
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "NOT") return !matches(row, value);
    if (key === "OR") return value.some(part => matches(row, part));
    if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
}

/** A locking, rollback-capable transaction double; no live database writes. */
function harness(options = {}) {
  const initialClaim = {
    id: "claim-1", itemId: "item-1", userId: "student", status: "PENDING", matchedReportId: "report-1",
    claimReason: "Mine", evidenceImageUrl: png, evidenceImageUrls: [png], adminNote: null,
    approvedAt: null, source: "STUDENT", createdAt: new Date(), ...options.claim,
  };
  let state = {
    claims: options.claim === null ? [] : [initialClaim, ...(options.extraClaims || [])],
    items: [{ id: "item-1", itemName: "Bottle", status: "FOUND", lockerId: null, locker: null, ...options.item },
      { id: "item-2", itemName: "Other bottle", status: "FOUND", lockerId: null, locker: null }],
    reports: [{ id: "report-1", userId: "student", type: "LOST", status: "MATCHED", itemId: "item-1",
      reviewedAt: new Date(), reviewedById: "admin", adminNote: "Previous review", ...options.report }, ...(options.extraReports || [])],
  };
  let tail = Promise.resolve(); let hookUsed = false;
  const writes = [];
  const claimView = id => {
    const claim = state.claims.find(row => row.id === id);
    return claim ? structuredClone({ ...claim, item: state.items.find(row => row.id === claim.itemId) }) : null;
  };
  const prisma = {
    claim: { findUnique: async ({ where }) => claimView(where.id) },
    $transaction: async fn => {
      let release; let snapshot; let locked = false;
      async function acquireItem() {
        if (locked) return;
        const previous = tail; tail = new Promise(resolve => { release = resolve; });
        await previous; locked = true;
        if (options.onLock && !hookUsed) { hookUsed = true; options.onLock(state); }
        snapshot = structuredClone(state);
      }
      const tx = {
        $queryRaw: async (strings, id) => {
          if (strings.join("").includes('"items"')) {
            await acquireItem();
            return state.items.some(row => row.id === id) ? [{ id }] : [];
          }
          assert.equal(locked, true, "item-first lock ordering");
          return state.claims.some(row => row.id === id) ? [{ id }] : [];
        },
        claim: {
          findUnique: async ({ where }) => claimView(where.id),
          findUniqueOrThrow: async ({ where }) => { const claim = claimView(where.id); assert.ok(claim); return claim; },
          findFirst: async ({ where }) => structuredClone(state.claims.find(row => matches(row, where)) || null),
          findMany: async ({ where }) => structuredClone(state.claims.filter(row => matches(row, where))),
          updateMany: async ({ where, data }) => {
            assert.equal(locked, true);
            if (options.claimConflict) return { count: 0 };
            const rows = state.claims.filter(row => matches(row, where));
            rows.forEach(row => Object.assign(row, data));
            writes.push({ kind: "claim-update", where: structuredClone(where), data: structuredClone(data) });
            return { count: rows.length };
          },
          deleteMany: async ({ where }) => {
            assert.equal(locked, true);
            if (options.deleteConflict) return { count: 0 };
            const before = state.claims.length;
            state.claims = state.claims.filter(row => !matches(row, where));
            writes.push({ kind: "claim-delete", where: structuredClone(where) });
            return { count: before - state.claims.length };
          },
        },
        report: {
          findFirst: async ({ where }) => structuredClone(state.reports.find(row => matches(row, where)) || null),
          findMany: async ({ where }) => structuredClone(state.reports.filter(row => matches(row, where))),
          updateMany: async ({ where, data }) => {
            assert.equal(locked, true);
            if (options.reportFailure) throw new Error("Simulated report persistence failure");
            const rows = options.linkConflict && data.status === "MATCHED" ? [] : state.reports.filter(row => matches(row, where));
            rows.forEach(row => Object.assign(row, data));
            writes.push({ kind: "report-update", where: structuredClone(where), data: structuredClone(data) });
            return { count: rows.length };
          },
        },
        item: { findUnique: async ({ where }) => structuredClone(state.items.find(row => row.id === where.id) || null), updateMany: async ({ where, data }) => {
          await acquireItem();
          const rows = state.items.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data));
          return { count: rows.length };
        } },
      };
      try { return await fn(tx); }
      catch (error) { if (snapshot) state = snapshot; throw error; }
      finally { release?.(); }
    },
  };
  const service = load("src/lib/claim-transition-service.ts", { "./prisma": { prisma }, "./claim-report-link": links, "./claim-validation": load("src/lib/claim-validation.ts") });
  return { ...service, prisma, state: () => structuredClone(state), writes };
}

const resubmission = { claimReason: "  Blue bottle with a sticker  ", evidenceImageUrls: ["sanitized-photo"] };
const rejected = { claim: { status: "REJECTED", adminNote: "Not enough evidence", approvedAt: new Date() }, report: { status: "PENDING", itemId: null } };

test("no-photo resubmission requires explicit consent and 80 ownership characters", async () => {
  for (const input of [
    { claimReason: "x".repeat(80), evidenceImageUrls: [] },
    { claimReason: "x".repeat(79), evidenceImageUrls: [], noPhoto: true },
  ]) {
    const h = harness(rejected);
    await assert.rejects(() => h.resubmitRejectedClaim("claim-1", "student", input), error => error.status === 400);
    assert.equal(h.writes.length, 0);
  }
  const h = harness(rejected);
  const result = await h.resubmitRejectedClaim("claim-1", "student", { claimReason: "x".repeat(80), evidenceImageUrls: [], noPhoto: true });
  assert.equal(result.status, "PENDING");
  assert.equal(result.evidenceImageUrl, null);
  assert.equal(result.evidenceImageUrls.length, 0);
  assert.equal(h.state().reports[0].status, "MATCHED");
});

test("rejecting a linked claim atomically restores its report without losing claim history", async () => {
  const h = harness();
  const result = await h.rejectPendingClaim("claim-1", "Insufficient proof");
  assert.equal(result.status, "REJECTED");
  assert.equal(result.matchedReportId, "report-1");
  assert.equal(result.adminNote, "Insufficient proof");
  const report = h.state().reports[0];
  assert.equal(report.status, "PENDING");
  for (const key of ["itemId", "reviewedAt", "reviewedById", "adminNote"]) assert.equal(report[key], null);
  assert.equal(h.state().items[0].status, "FOUND");
});

test("cancelling a linked pending claim restores the report and removes only that claim", async () => {
  const h = harness();
  await h.cancelPendingClaim("claim-1", "student");
  assert.equal(h.state().claims.length, 0);
  assert.equal(h.state().reports[0].status, "PENDING");
  assert.equal(h.state().reports[0].itemId, null);
  assert.equal(h.state().items.length, 2);
});

test("unlinked rejection and cancellation do not change unrelated reports", async () => {
  for (const action of ["reject", "cancel"]) {
    const h = harness({ claim: { matchedReportId: null } }); const before = h.state().reports;
    if (action === "reject") await h.rejectPendingClaim("claim-1", null);
    else await h.cancelPendingClaim("claim-1", "student");
    assert.deepEqual(h.state().reports, before);
    assert.equal(h.writes.some(write => write.kind === "report-update"), false);
  }
});

test("rejection and cancellation never reopen closed, reassigned, foreign or found reports", async () => {
  for (const report of [
    { status: "CLOSED" }, { status: "REJECTED" }, { itemId: "item-2" }, { userId: "other-student" }, { type: "FOUND", status: "VERIFIED" },
  ]) {
    for (const action of ["reject", "cancel"]) {
      const h = harness({ report }); const before = h.state().reports;
      if (action === "reject") await h.rejectPendingClaim("claim-1", null);
      else await h.cancelPendingClaim("claim-1", "student");
      assert.deepEqual(h.state().reports, before);
    }
  }
});

test("another active claim retains its report when an older linked claim is rejected or cancelled", async () => {
  for (const action of ["reject", "cancel"]) {
    const h = harness({ extraClaims: [{ id: "claim-2", matchedReportId: "report-1", status: "PENDING", itemId: "item-1", userId: "student" }] });
    if (action === "reject") await h.rejectPendingClaim("claim-1", null);
    else await h.cancelPendingClaim("claim-1", "student");
    assert.equal(h.state().reports[0].status, "MATCHED");
    assert.equal(h.writes.some(write => write.kind === "report-update"), false);
  }
});

test("report persistence failures roll back rejection and cancellation instead of silently leaving stuck links", async () => {
  for (const action of ["reject", "cancel"]) {
    const h = harness({ reportFailure: true }); const before = h.state();
    await assert.rejects(() => action === "reject" ? h.rejectPendingClaim("claim-1", null) : h.cancelPendingClaim("claim-1", "student"));
    assert.deepEqual(h.state(), before);
  }
});

test("resubmitting atomically relinks a pending report and resets the rejected claim's review fields", async () => {
  const h = harness(rejected);
  const result = await h.resubmitRejectedClaim("claim-1", "student", resubmission);
  assert.equal(result.status, "PENDING");
  assert.equal(result.claimReason, "Blue bottle with a sticker");
  assert.equal(result.evidenceImageUrl, "sanitized-photo");
  assert.equal(result.approvedAt, null);
  assert.equal(result.adminNote, null);
  assert.equal(h.state().reports[0].status, "MATCHED");
  assert.equal(h.state().reports[0].itemId, "item-1");
});

test("resubmitting never steals a report from a newer active claim or changes closed/foreign reports", async () => {
  for (const options of [
    { report: { status: "CLOSED" } }, { report: { status: "REJECTED" } },
    { report: { status: "MATCHED", itemId: "item-2" } }, { report: { type: "FOUND" } }, { report: { userId: "other-student" } },
    { extraClaims: [{ id: "claim-2", userId: "student", itemId: "item-2", status: "PENDING", matchedReportId: "report-1" }] },
  ]) {
    const h = harness({ ...rejected, ...options, report: { ...rejected.report, ...options.report } }); const before = h.state();
    await assert.rejects(() => h.resubmitRejectedClaim("claim-1", "student", resubmission), error => error.status === 409);
    assert.deepEqual(h.state(), before);
  }
});

test("resubmission rejects unavailable inventory, duplicate claims, and items handed in by the claimant", async () => {
  for (const options of [
    ...["CLAIMED", "RETRIEVED", "EXPIRED"].map(status => ({ item: { status } })),
    { extraClaims: [{ id: "claim-2", userId: "student", itemId: "item-1", status: "PENDING" }] },
    { extraClaims: [{ id: "claim-2", userId: "someone-else", itemId: "item-1", status: "APPROVED" }] },
    { extraReports: [{ id: "found-1", userId: "student", type: "FOUND", itemId: "item-1", status: "VERIFIED" }] },
  ]) {
    const h = harness({ ...rejected, ...options }); const before = h.state();
    await assert.rejects(() => h.resubmitRejectedClaim("claim-1", "student", resubmission), h.ClaimTransitionError);
    assert.deepEqual(h.state(), before);
  }
});

test("resubmission of an unlinked claim does not attach an arbitrary report", async () => {
  const h = harness({ ...rejected, claim: { ...rejected.claim, matchedReportId: null } });
  await h.resubmitRejectedClaim("claim-1", "student", resubmission);
  assert.equal(h.state().claims[0].matchedReportId, null);
  assert.equal(h.state().reports[0].status, "PENDING");
});

test("ownership, status and missing-record guards leave all state unchanged", async () => {
  for (const operation of [
    h => h.cancelPendingClaim("claim-1", "other-student"),
    h => h.resubmitRejectedClaim("claim-1", "other-student", resubmission),
    h => h.rejectPendingClaim("missing", null),
    h => h.resubmitRejectedClaim("claim-1", "student", resubmission),
  ]) {
    const h = harness(); const before = h.state();
    await assert.rejects(() => operation(h), h.ClaimTransitionError);
    assert.deepEqual(h.state(), before);
  }
  for (const status of ["APPROVED", "REJECTED"]) {
    const h = harness({ claim: { status } }); const before = h.state();
    await assert.rejects(() => h.cancelPendingClaim("claim-1", "student"), error => error.status === 409);
    await assert.rejects(() => h.rejectPendingClaim("claim-1", null), error => error.status === 409);
    assert.deepEqual(h.state(), before);
  }
});

test("conditional write conflicts roll back report relinking and claim changes", async () => {
  for (const options of [{ claimConflict: true }, { linkConflict: true }, { reportFailure: true }]) {
    const h = harness({ ...rejected, ...options }); const before = h.state();
    await assert.rejects(() => h.resubmitRejectedClaim("claim-1", "student", resubmission));
    assert.deepEqual(h.state(), before);
  }
  const h = harness({ deleteConflict: true }); const before = h.state();
  await assert.rejects(() => h.cancelPendingClaim("claim-1", "student"), error => error.status === 409);
  assert.deepEqual(h.state(), before);
});

test("two simultaneous resubmissions have one winner and one active report link", async () => {
  const h = harness(rejected);
  const results = await Promise.allSettled([h.resubmitRejectedClaim("claim-1", "student", resubmission), h.resubmitRejectedClaim("claim-1", "student", resubmission)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(h.state().claims.filter(claim => claim.status === "PENDING").length, 1);
  assert.equal(h.writes.filter(write => write.kind === "report-update").length, 1);
});

test("two rejected claims cannot both take the same pending lost report", async () => {
  const h = harness({ ...rejected, extraClaims: [{ id: "claim-2", userId: "student", itemId: "item-2", status: "REJECTED", matchedReportId: "report-1" }] });
  const results = await Promise.allSettled([h.resubmitRejectedClaim("claim-1", "student", resubmission), h.resubmitRejectedClaim("claim-2", "student", resubmission)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(h.state().claims.filter(claim => claim.status === "PENDING").length, 1);
});

test("simultaneous rejection and cancellation leave the report pending with no orphaned match", async () => {
  const h = harness();
  const results = await Promise.allSettled([h.rejectPendingClaim("claim-1", null), h.cancelPendingClaim("claim-1", "student")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(h.state().reports[0].status, "PENDING");
});

test("approval or reassignment committed while waiting is not undone by a stale transition", async () => {
  const h = harness({ onLock: state => { state.claims[0].status = "APPROVED"; state.items[0].status = "CLAIMED"; state.reports[0].status = "CLOSED"; } });
  await assert.rejects(() => h.cancelPendingClaim("claim-1", "student"), error => error.status === 409);
  assert.equal(h.state().claims[0].status, "APPROVED");
  assert.equal(h.state().reports[0].status, "CLOSED");
});

test("only pending/approved claims suppress their matched lost-report queue rows", () => {
  const ids = links.activeLinkedReportIds([
    { status: "REJECTED", matchedReportId: "restored-report" }, { status: "PENDING", matchedReportId: "active-report" },
    { status: "APPROVED", matchedReportId: "approved-report" }, { status: "PENDING", matchedReportId: null },
  ]);
  assert.equal(ids.has("restored-report"), false);
  assert.equal(ids.has("active-report"), true);
  assert.equal(ids.has("approved-report"), true);
  const source = fs.readFileSync(path.join(__dirname, "../src/app/dashboard/admin/claims/page.tsx"), "utf8");
  assert.match(source, /activeLinkedReportIds\(claims\)/);
  assert.match(source, /report\.status !== "MATCHED" \|\| !claimedReportIds\.has\(report\.id\)/);
});

function routes(h, user) {
  const dependencies = {
    "next/server": { NextResponse: Response }, "@/lib/prisma": { prisma: h.prisma },
    "@/lib/auth": { authenticateRequest: async () => user }, "@/lib/claim-transition-service": h,
    "@/lib/claim-validation": load("src/lib/claim-validation.ts"),
    "@/lib/image-validation": validation, "@/lib/notification-service": { notifyUser: async () => {}, notifyUsers: async () => {} },
    "@/lib/claim-review-service": load("src/lib/claim-review-service.ts", {
      "./prisma": { prisma: h.prisma }, "./image-validation": validation, "./report-include": { REPORT_INCLUDE: {} }, "node:crypto": crypto,
    }),
  };
  return {
    claim: load("src/app/api/claims/[id]/route.ts", dependencies),
    resubmit: load("src/app/api/claims/[id]/resubmit/route.ts", dependencies),
  };
}
const context = { params: Promise.resolve({ id: "claim-1" }) };
const request = body => ({ json: async () => body });

test("HTTP rejection, resubmission and cancellation complete the full linked-report lifecycle", async () => {
  const h = harness();
  const admin = routes(h, { id: "admin", role: "ADMIN" });
  const student = routes(h, { id: "student", role: "STUDENT" });
  assert.equal((await admin.claim.PATCH(request({ action: "reject", adminNote: "More evidence needed" }), context)).status, 200);
  assert.equal(h.state().reports[0].status, "PENDING");
  const form = new FormData(); form.set("claimReason", "New evidence"); form.set("keepImages", JSON.stringify([png]));
  assert.equal((await student.resubmit.POST({ formData: async () => form }, context)).status, 200);
  assert.equal(h.state().reports[0].status, "MATCHED");
  assert.equal((await student.claim.DELETE({}, context)).status, 200);
  assert.equal(h.state().reports[0].status, "PENDING");
  assert.equal(h.state().claims.length, 0);
});

test("HTTP transition endpoints enforce staff and owner permissions", async () => {
  const h = harness(); const before = h.state();
  for (const [user, expected] of [[null, 401], [{ id: "student", role: "STUDENT" }, 403]]) {
    assert.equal((await routes(h, user).claim.PATCH(request({ action: "reject" }), context)).status, expected);
  }
  assert.equal((await routes(h, { id: "other", role: "STUDENT" }).claim.DELETE({}, context)).status, 403);
  assert.equal((await routes(h, { id: "admin", role: "ADMIN" }).claim.DELETE({}, context)).status, 403);
  assert.deepEqual(h.state(), before);
});

test("approval rolls back if rejection committed after its initial Pending read", async () => {
  const h = harness({ onLock: state => { state.claims[0].status = "REJECTED"; state.reports[0].status = "PENDING"; state.reports[0].itemId = null; } });
  const response = await routes(h, { id: "admin", role: "ADMIN" }).claim.PATCH(request({ action: "approve" }), context);
  assert.equal(response.status, 409);
  assert.equal(h.state().claims[0].status, "REJECTED");
  assert.equal(h.state().items[0].status, "FOUND");
  assert.equal(h.state().reports[0].status, "PENDING");
});
