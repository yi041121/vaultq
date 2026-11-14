/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { validation: imageValidation, png } = require("./helpers/image-validation.cjs");

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports, Date, Buffer, File, console,
    require: (id) => { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; },
    ...globals,
  });
  return exports;
}

function notificationHarness(options = {}) {
  const alerts = [];
  const queries = [];
  let locks = 0;
  const item = {
    id: "item-1", itemName: "Blue water bottle", category: "Water Bottles", foundDate: new Date("2026-11-13"),
    foundLocation: "Library", status: "FOUND", reports: [], claims: [], ...options.item,
  };
  const reports = options.reports || [{ id: "report-1", userId: "student-1", itemName: "Blue water bottle", category: "Water Bottles", location: "Library", date: new Date("2026-11-12"), status: "PENDING" }];
  const tx = {
    $queryRaw: async () => { locks++; },
    item: { findUnique: async () => item },
    report: { findMany: async ({ where }) => {
      queries.push(where);
      return reports.filter((r) => r.status === where.status && (!where.id || r.id === where.id) && !where.userId.notIn.includes(r.userId));
    } },
    notification: {
      findMany: async () => alerts,
      createMany: async ({ data }) => { alerts.push(...data); },
    },
  };
  const service = load("src/lib/match-notification-service.ts", {
    "./prisma": { prisma: { item: { findMany: async () => [{ id: item.id }] }, $transaction: async (fn) => fn(tx) } },
    "./report-match": load("src/lib/report-match.ts"),
  });
  return { ...service, alerts, queries, locks: () => locks };
}

test("similar inventory creates a review-only notification linking the exact item and report", async () => {
  const h = notificationHarness();
  await h.notifyInventoryMatches({ itemId: "item-1" });
  assert.equal(h.alerts.length, 1);
  assert.equal(h.alerts[0].userId, "student-1");
  assert.equal(h.alerts[0].link, "/dashboard/student/search?item=item-1&report=report-1");
  assert.match(h.alerts[0].message, /not an ownership confirmation/);
  assert.equal(h.locks(), 1);
});

test("inventory retries and edits do not send the same report/item alert twice", async () => {
  const h = notificationHarness();
  await h.notifyInventoryMatches({ itemId: "item-1" });
  await h.notifyInventoryMatches({ itemId: "item-1" });
  assert.equal(h.alerts.length, 1);
});

test("new lost reports can be matched against inventory already present", async () => {
  const h = notificationHarness();
  await h.notifyInventoryMatches({ reportId: "report-1" });
  assert.equal(h.queries[0].id, "report-1");
  assert.equal(h.alerts.length, 1);
});

test("unrelated items and unavailable inventory produce no alerts", async () => {
  for (const item of [{ itemName: "Student ID card", category: "Student Cards" }, { status: "CLAIMED" }]) {
    const h = notificationHarness({ item });
    await h.notifyInventoryMatches({ itemId: "item-1" });
    assert.equal(h.alerts.length, 0);
  }
});

test("founders and existing claimants are excluded from match alerts", async () => {
  for (const item of [{ reports: [{ userId: "student-1" }] }, { claims: [{ userId: "student-1" }] }]) {
    const h = notificationHarness({ item });
    await h.notifyInventoryMatches({ itemId: "item-1" });
    assert.equal(h.alerts.length, 0);
  }
});

test("closed or already matched reports receive no possible-match notification", async () => {
  const h = notificationHarness({ reports: [{ id: "r", userId: "student-1", itemName: "Blue water bottle", status: "MATCHED" }] });
  await h.notifyInventoryMatches({ itemId: "item-1" });
  assert.equal(h.alerts.length, 0);
});

test("claim explanation includes every lost-report detail with the shared date format", () => {
  const helper = load("src/lib/lost-report-claim.ts", { "./date-format": load("src/lib/date-format.ts") });
  assert.equal(helper.lostReportClaimReason({ itemName: "Bottle", category: "Water Bottles", date: "2026-11-13", location: "Library", description: "Blue with a sticker" }),
    "Item: Bottle\nCategory: Water Bottles\nLost on: 13 Nov 2026\nLost at: Library\nDescription: Blue with a sticker");
});

function claimHarness(options = {}) {
  const created = [];
  const updates = [];
  const report = { id: "report-1", userId: "student-1", type: "LOST", status: "PENDING", imageUrl: png, imageUrls: [png], ...options.report };
  const tx = {
    $queryRaw: async () => options.unavailable ? [] : [{ id: "item-1" }],
    claim: { findFirst: async () => null, create: async ({ data }) => { created.push(data); return { id: "claim-1", ...data }; } },
    report: { findFirst: async () => null, updateMany: async (args) => { updates.push(args); return { count: options.reportChanged ? 0 : 1 }; } },
  };
  const route = load("src/app/api/claims/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
    "@/lib/prisma": { prisma: {
      item: { findUnique: async () => ({ id: "item-1", itemName: "Bottle", status: "FOUND" }) },
      report: { findFirst: async () => null, findUnique: async () => report },
      claim: { findFirst: async () => null }, notification: { create: async () => ({}) },
      $transaction: async (fn) => fn(tx),
    } },
    "@/lib/auth": { authenticateRequest: async () => ({ id: "student-1", role: "STUDENT" }) },
    "@/lib/image-url": { signedImageUrl: () => "" },
    "@/lib/photo-gallery": load("src/lib/photo-gallery.ts"),
    "@/lib/image-validation": imageValidation,
    "@/lib/claim-validation": { NO_PHOTO_REASON_MIN_LENGTH: 80 },
  });
  const request = {
    headers: { get: () => "application/json" },
    json: async () => ({ itemId: "item-1", reportId: "report-1", claimReason: "My blue bottle", ...options.body }),
  };
  return { route, request, created, updates };
}

test("linked claim reuses owned report photos and moves the report out of pending atomically", async () => {
  const h = claimHarness();
  const result = await h.route.POST(h.request);
  assert.equal(result.status, 201);
  assert.equal(h.created[0].matchedReportId, "report-1");
  assert.equal(h.created[0].evidenceImageUrls[0], await imageValidation.normalizeImageSource(png));
  assert.equal(h.updates[0].where.status, "PENDING");
  assert.equal(h.updates[0].where.userId, "student-1");
  assert.equal(h.updates[0].data.status, "MATCHED");
});

test("another student's report or a non-pending report cannot be reused as evidence", async () => {
  for (const report of [{ userId: "another-student" }, { status: "MATCHED" }, { type: "FOUND" }]) {
    const h = claimHarness({ report });
    assert.equal((await h.route.POST(h.request)).status, 400);
    assert.equal(h.created.length, 0);
  }
});

test("unlinked claims and reports without photos still require uploaded evidence", async () => {
  for (const options of [{ body: { reportId: null } }, { report: { imageUrl: null, imageUrls: [] } }]) {
    const h = claimHarness(options);
    assert.equal((await h.route.POST(h.request)).status, 400);
    assert.equal(h.created.length, 0);
  }
});

test("a report linked concurrently or item claimed concurrently returns a conflict", async () => {
  for (const options of [{ reportChanged: true }, { unavailable: true }]) {
    const h = claimHarness(options);
    assert.equal((await h.route.POST(h.request)).status, 409);
  }
});

test("admin suppresses the linked lost row and labels student submissions as claims", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/dashboard/admin/claims/page.tsx"), "utf8");
  assert.match(source, /!claimedReportIds\.has\(report\.id\)/);
  assert.match(source, /cl\.source === "MATCH" \? \(/);
  assert.doesNotMatch(source, /cl\.source === "MATCH" \|\| cl\.matchedReportDescription/);
});
