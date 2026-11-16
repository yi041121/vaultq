/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const server = { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
function compile(source, deps = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, console, ...globals, require(id) {
    assert.ok(id in deps, `Unexpected dependency: ${id}`);
    return deps[id];
  } });
  return exports;
}
function load(file, deps) {
  deps = require("./helpers/notification-stub.cjs").withNotificationStub(deps);
  return compile(fs.readFileSync(path.join(root, file), "utf8"), deps);
}

function reportHarness({ role = "STUDENT", type = "LOST", conflict = false } = {}) {
  const alerts = [];
  const report = { id: "report", userId: "student", type, status: role === "ADMIN" ? "CLOSED" : "PENDING", itemId: null };
  const prisma = {
    report: { findUnique: async () => report, findFirst: async () => null },
    $transaction: async fn => fn({ report: {
      updateMany: async () => ({ count: conflict ? 0 : 1 }),
      findUniqueOrThrow: async () => report,
    } }),
  };
  class ClaimReviewError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const route = load("src/app/api/reports/[id]/route.ts", {
    "next/server": server, "@/lib/prisma": { prisma },
    "@/lib/auth": { authenticateRequest: async () => ({ id: "student", role }) },
    "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => null },
    "@/lib/notification-service": {}, "@/lib/report-include": { REPORT_INCLUDE: {} },
    "@/lib/report-validation": { validateReportDetails: () => ({ ok: true, value: { itemName: "Bottle" } }) },
    "@/lib/image-validation": { ImageValidationError: class extends Error {} },
    "@/lib/claim-review-service": { ClaimReviewError, isReviewWriteConflict: () => false, reviewUnclaimedReport: async (_id, _expected, _data, _itemId, onWrite) => { await onWrite?.({}); return report; } },
    "@/lib/match-notification-service": { notifyInventoryMatches: async scope => alerts.push(scope) },
  });
  return { alerts, run: body => route.PATCH({ json: async () => body }, { params: Promise.resolve({ id: "report" }) }) };
}

test("editing and reopening lost reports rechecks existing inventory", async () => {
  for (const role of ["STUDENT", "ADMIN"]) {
    const h = reportHarness({ role });
    assert.equal((await h.run(role === "ADMIN" ? { action: "reopen" } : {})).status, 200);
    assert.equal(h.alerts.length, 1);
    assert.equal(h.alerts[0].reportId, "report");
  }
});

test("found-report edits and failed lost-report edits never schedule match alerts", async () => {
  const found = reportHarness({ type: "FOUND" });
  assert.equal((await found.run({})).status, 200);
  assert.equal(found.alerts.length, 0);
  const stale = reportHarness({ conflict: true });
  assert.equal((await stale.run({})).status, 409);
  assert.equal(stale.alerts.length, 0);
});

test("report edits reject non-object bodies as client errors", async () => {
  for (const body of [null, [], "invalid", 42]) {
    assert.equal((await reportHarness().run(body)).status, 400);
  }
});

function profileHarness({ code, cardBarcode = null } = {}) {
  const writes = [];
  const route = load("src/app/api/user/profile/route.ts", {
    "next/server": server,
    "@/lib/auth": { authenticateRequest: async () => ({ id: "student", role: "STUDENT", cardBarcode }) },
    "@/lib/person-name": { getPersonNameError: () => null },
    "@/lib/student-id": { normalizeStudentId: value => value, isValidStudentId: () => true },
    "@/lib/prisma": { prisma: { user: {
      findFirst: async () => null,
      update: async args => {
        writes.push(args);
        if (code) throw Object.assign(new Error("simulated conflict"), { code });
        return { id: "student", ...args.data };
      },
    } } },
  });
  return { writes, run: body => route.PATCH({ json: async () => body }) };
}

test("first-time barcode assignment guards against a concurrent assignment", async () => {
  const h = profileHarness();
  assert.equal((await h.run({ cardBarcode: "1234567890" })).status, 200);
  assert.equal(h.writes[0].where.id, "student");
  assert.equal(h.writes[0].where.AND[0].cardBarcode, null);
  const stale = profileHarness({ code: "P2025" });
  assert.equal((await stale.run({ cardBarcode: "1234567890" })).status, 409);
});

test("profile uniqueness races return conflicts instead of server errors", async () => {
  const h = profileHarness({ code: "P2002" });
  assert.equal((await h.run({ cardBarcode: "1234567890" })).status, 409);
});

test("existing barcode cannot be changed through profile setup", async () => {
  const h = profileHarness({ cardBarcode: "1111111111" });
  assert.equal((await h.run({ cardBarcode: "1234567890" })).status, 403);
  assert.equal(h.writes.length, 0);
});

test("profile rejects invalid JSON and non-object bodies before writing", async () => {
  for (const body of [null, [], "invalid", 42]) {
    const h = profileHarness();
    assert.equal((await h.run(body)).status, 400);
    assert.equal(h.writes.length, 0);
  }
});

test("lost-report fetch failures remain retryable, while successful empty lists are cached", async () => {
  const page = fs.readFileSync(path.join(root, "src/app/dashboard/student/search/page.tsx"), "utf8");
  const start = page.indexOf("  async function loadLostReports(");
  const end = page.indexOf("  async function loadData(", start);
  assert.ok(start > 0 && end > start);
  // Execute the actual loader with network/state doubles, not just a source assertion.
  const source = `export ${page.slice(start, end).trim()}`;
  for (const failure of ["network", "http", "malformed"]) {
    let attempt = 0;
    const loaded = [];
    const lists = [];
    const { loadLostReports } = compile(source, {}, {
      fetchReportPages: async () => {
        if (attempt++ === 0) {
          if (failure === "network") throw new Error("offline");
          return { ok: failure !== "http", json: async () => failure === "malformed" ? { success: true, data: null } : { success: false } };
        }
        return { ok: true, json: async () => ({ success: true, data: [] }) };
      },
      setLostReports: value => lists.push(value),
      setLostReportsLoaded: value => loaded.push(value),
    });
    assert.equal(await loadLostReports("session"), null);
    assert.equal(loaded.length, 0);
    assert.equal(lists.length, 0);
    assert.equal((await loadLostReports("session")).length, 0);
    assert.deepEqual(loaded, [true]);
  }
});
