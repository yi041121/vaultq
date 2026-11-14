/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, deps = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, URL, Response, File, console, ...globals, require(name) {
    assert.ok(name in deps, `Unexpected dependency ${name}`);
    return deps[name];
  } });
  return exports;
}
const server = { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } };
const limits = { enforceAuthRateLimit: async () => null };

function lockerHarness(options = {}) {
  let state = { lockers: [{ id: "locker", status: "AVAILABLE" }], items: [{ id: "item", status: "FOUND", lockerId: null }], ...options.state };
  let tail = Promise.resolve();
  const log = [];
  const view = id => {
    const locker = state.lockers.find(row => row.id === id);
    return locker ? structuredClone({ ...locker, item: state.items.find(row => row.lockerId === id) ?? null }) : null;
  };
  let hookUsed = false;
  const prisma = { $transaction: async fn => {
    let release, snapshot;
    const tx = {
      $queryRaw: async (strings, id) => {
        if (!release) {
          const previous = tail;
          tail = new Promise(resolve => { release = resolve; });
          await previous;
          if (options.onLock && !hookUsed) { hookUsed = true; options.onLock(state); }
          snapshot = structuredClone(state);
        }
        const kind = strings.join("").includes('"items"') ? "items" : "lockers";
        log.push({ kind, id });
        return state[kind].some(row => row.id === id) ? [{ id }] : [];
      },
      locker: {
        findUnique: async ({ where }) => view(where.id),
        update: async ({ where, data }) => { Object.assign(state.lockers.find(row => row.id === where.id), data); return view(where.id); },
        delete: async ({ where }) => { state.lockers = state.lockers.filter(row => row.id !== where.id); },
      },
      item: {
        findUnique: async ({ where }) => structuredClone(state.items.find(row => row.id === where.id) ?? null),
        update: async ({ where, data }) => { Object.assign(state.items.find(row => row.id === where.id), data); },
      },
    };
    try { return await fn(tx); }
    catch (error) { if (snapshot) state = snapshot; throw error; }
    finally { release?.(); }
  } };
  return { ...load("src/lib/locker-management-service.ts", { "./prisma": { prisma } }), state: () => state, log };
}

test("manual lockers cannot be marked available/maintenance with an attached item", async () => {
  for (const status of ["AVAILABLE", "MAINTENANCE"]) {
    const h = lockerHarness({ state: { lockers: [{ id: "locker", status: "OCCUPIED" }], items: [{ id: "item", status: "FOUND", lockerId: "locker" }] } });
    await assert.rejects(() => h.changeLocker("locker", { status }), error => error.status === 409);
    assert.equal(h.state().lockers[0].status, "OCCUPIED");
    assert.equal(h.state().items[0].lockerId, "locker");
  }
  const empty = lockerHarness();
  await assert.rejects(() => empty.changeLocker("locker", { status: "OCCUPIED" }), error => error.status === 409);
});

test("manual assignment/release lock the item first and keep locker state consistent", async () => {
  const h = lockerHarness();
  await h.changeLocker("locker", { itemId: "item" });
  assert.equal(h.state().items[0].lockerId, "locker");
  assert.equal(h.state().lockers[0].status, "OCCUPIED");
  assert.deepEqual(h.log.map(entry => entry.kind), ["items", "lockers"]);
  await h.changeLocker("locker", { release: true });
  assert.equal(h.state().items[0].lockerId, null);
  assert.equal(h.state().lockers[0].status, "AVAILABLE");
  await h.deleteEmptyLocker("locker");
  assert.equal(h.state().lockers.length, 0);
});

test("concurrent manual assignments have one winner and cannot move approved inventory", async () => {
  const h = lockerHarness({ state: { lockers: [{ id: "locker", status: "AVAILABLE" }], items: [{ id: "item", status: "FOUND", lockerId: null }, { id: "other", status: "FOUND", lockerId: null }] } });
  const results = await Promise.allSettled([h.changeLocker("locker", { itemId: "item" }), h.changeLocker("locker", { itemId: "other" })]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(h.state().items.filter(row => row.lockerId === "locker").length, 1);
  const approved = lockerHarness({ state: { lockers: [{ id: "locker", status: "OCCUPIED" }], items: [{ id: "item", status: "CLAIMED", lockerId: "locker" }] } });
  await assert.rejects(() => approved.changeLocker("locker", { release: true }), error => error.status === 409);
  assert.equal(approved.state().items[0].lockerId, "locker");
});

test("a stale release cannot detach an item that moved to another locker", async () => {
  const h = lockerHarness({
    state: { lockers: [{ id: "locker", status: "OCCUPIED" }, { id: "new", status: "AVAILABLE" }], items: [{ id: "item", status: "FOUND", lockerId: "locker" }] },
    onLock: state => { state.items[0].lockerId = "new"; state.lockers[0].status = "AVAILABLE"; state.lockers[1].status = "OCCUPIED"; },
  });
  await assert.rejects(() => h.changeLocker("locker", { release: true }), error => error.status === 409);
  assert.equal(h.state().items[0].lockerId, "new");
  assert.equal(h.state().lockers[1].status, "OCCUPIED");
});

test("students cannot read locker assignments or override inventory visibility", async () => {
  const auth = { authenticateRequest: async () => ({ id: "student", role: "STUDENT" }) };
  const never = async () => { throw new Error("Unauthorised read reached database"); };
  const deps = { "next/server": server, "@/lib/auth": auth, "@/lib/prisma": { prisma: { locker: { findMany: never, findUnique: never } } }, "@/lib/image-url": {}, "@/lib/locker-management-service": {} };
  assert.equal((await load("src/app/api/lockers/route.ts", deps).GET({})).status, 403);
  assert.equal((await load("src/app/api/lockers/[id]/route.ts", deps).GET({}, { params: Promise.resolve({ id: "locker" }) })).status, 403);
  let filter;
  const inventory = load("src/app/api/items/route.ts", {
    ...deps, "@/lib/categories": {}, "@/lib/item-service": {}, "@/lib/match-notification-service": {}, "@/lib/image-validation": {},
    "@/lib/prisma": { prisma: { item: { findMany: async ({ where }) => { filter = where; return []; } } } },
  });
  assert.equal((await inventory.GET({ url: "https://test/api/items?status=RETRIEVED" })).status, 200);
  assert.equal(filter.status, "FOUND");
});

function verificationHarness({ changed = false, failCreate = false } = {}) {
  let report = { id: "report", userId: "student", type: "FOUND", status: "PENDING", itemId: null, itemName: "Bag", description: "Black bag", category: "Bags", location: "Library", date: null, imageUrl: null, imageUrls: [] };
  let items = [];
  let tail = Promise.resolve();
  const prisma = { report: { findUnique: async () => structuredClone(report) }, $transaction: async fn => {
    let release;
    const previous = tail; tail = new Promise(resolve => { release = resolve; });
    await previous;
    if (changed) report.description = "Edited details";
    const snapshot = structuredClone({ report, items });
    const tx = {
      report: {
        updateMany: async ({ where, data }) => {
          const matches = Object.entries(where).every(([key, value]) => JSON.stringify(report[key]) === JSON.stringify(value && typeof value === "object" && "equals" in value ? value.equals : value));
          if (matches) Object.assign(report, data);
          return { count: matches ? 1 : 0 };
        },
        update: async ({ data }) => Object.assign(report, data),
      },
      item: { create: async ({ data }) => { if (failCreate) throw new Error("write failed"); const item = { ...data, id: `item-${items.length}` }; items.push(item); return item; } },
      locker: {},
    };
    try { return await fn(tx); }
    catch (error) { report = snapshot.report; items = snapshot.items; throw error; }
    finally { release(); }
  } };
  const service = load("src/lib/item-service.ts", { "./prisma": { prisma } });
  const route = load("src/app/api/reports/[id]/verify/route.ts", {
    "next/server": server, "@/lib/auth": { authenticateRequest: async () => ({ id: "admin", role: "ADMIN" }) }, "@/lib/prisma": { prisma },
    "@/lib/categories": { isItemCategory: () => true }, "@/lib/item-service": service,
    "@/lib/notification-service": { notifyUser: async () => {} }, "@/lib/report-include": {},
    "@/lib/match-notification-service": { notifyInventoryMatches: async () => {} },
    "@/lib/image-validation": { ImageValidationError: class extends Error {} },
  });
  return { run: () => route.POST({ json: async () => ({}) }, { params: Promise.resolve({ id: "report" }) }), state: () => ({ report, items }) };
}

test("parallel found-report verification creates one item, not orphaned duplicates", async () => {
  const h = verificationHarness();
  const results = await Promise.all([h.run(), h.run()]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  assert.equal(h.state().items.length, 1);
  assert.equal(h.state().report.itemId, h.state().items[0].id);
});

test("found verification refuses changed details and rolls back failed inventory creation", async () => {
  const edited = verificationHarness({ changed: true });
  assert.equal((await edited.run()).status, 409);
  assert.equal(edited.state().items.length, 0);
  const failing = verificationHarness({ failCreate: true });
  assert.equal((await failing.run()).status, 500);
  assert.equal(failing.state().report.status, "PENDING");
});

test("item creation atomically reserves a still-empty available locker", async () => {
  const service = load("src/lib/item-service.ts", { "./prisma": {} });
  let created = 0;
  const db = { locker: { updateMany: async ({ where }) => { assert.equal(where.status, "AVAILABLE"); assert.equal(where.item.is, null); return { count: 0 }; } }, item: { create: async () => { created++; } } };
  await assert.rejects(() => service.createItemRecord(db, "admin", { itemName: "Bag", foundLocation: "Library", lockerId: "locker" }), service.ItemAllocationConflict);
  assert.equal(created, 0);
});

function itemMoveHarness({ stale = false, targetBusy = false, maintenance = false } = {}) {
  const state = {
    item: { id: "item", status: "FOUND", lockerId: "old" },
    lockers: [{ id: "old", status: maintenance ? "MAINTENANCE" : "OCCUPIED" }, { id: "new", status: "AVAILABLE" }],
  };
  let locks = 0;
  const view = id => ({ ...state.lockers.find(row => row.id === id), item: state.item.lockerId === id ? { id: "item" } : null });
  const tx = {
    $queryRaw: async () => {
      if (locks++ === 0) {
        if (stale) state.item.lockerId = "changed";
        if (targetBusy) state.lockers[1].status = "MAINTENANCE";
      }
      return [{ id: "locked" }];
    },
    item: {
      findUnique: async () => structuredClone(state.item),
      updateMany: async ({ where, data }) => {
        if (where.lockerId !== state.item.lockerId) return { count: 0 };
        Object.assign(state.item, data); return { count: 1 };
      },
    },
    locker: {
      findUnique: async ({ where }) => view(where.id),
      updateMany: async ({ where, data }) => {
        const locker = state.lockers.find(row => row.id === where.id && row.status === where.status);
        if (!locker || state.item.lockerId === where.id) return { count: 0 };
        Object.assign(locker, data); return { count: 1 };
      },
      update: async ({ where, data }) => Object.assign(state.lockers.find(row => row.id === where.id), data),
    },
  };
  const route = load("src/app/api/items/[id]/route.ts", {
    "next/server": server, "@/lib/auth": { authenticateRequest: async () => ({ id: "admin", role: "ADMIN" }) },
    "@/lib/prisma": { prisma: { item: { findUnique: async () => structuredClone(state.item) }, locker: { findUnique: async ({ where }) => view(where.id) }, $transaction: async fn => fn(tx) } },
    "@/lib/match-notification-service": { notifyInventoryMatches: async () => {} }, "@/lib/image-validation": { ImageValidationError: class extends Error {} },
  });
  return { state, move: (lockerId = "new") => route.PATCH({ json: async () => ({ lockerId }) }, { params: Promise.resolve({ id: "item" }) }) };
}

test("inventory moves recheck both assignment and destination after locking", async () => {
  const good = itemMoveHarness();
  assert.equal((await good.move()).status, 200);
  assert.equal(good.state.item.lockerId, "new");
  assert.equal(good.state.lockers[0].status, "AVAILABLE");
  assert.equal(good.state.lockers[1].status, "OCCUPIED");
  for (const options of [{ stale: true }, { targetBusy: true }]) {
    const h = itemMoveHarness(options);
    assert.equal((await h.move()).status, 409);
    assert.equal(h.state.lockers[0].status, "OCCUPIED");
  }
});

test("inventory moves do not accidentally clear or repair maintenance state", async () => {
  const h = itemMoveHarness({ maintenance: true });
  assert.equal((await h.move()).status, 200);
  assert.equal(h.state.lockers[0].status, "MAINTENANCE");
  const same = itemMoveHarness({ maintenance: true });
  assert.equal((await same.move("old")).status, 409);
  assert.equal(same.state.lockers[0].status, "MAINTENANCE");
});

test("report-page loader follows cursors, retains filters, and never returns a partial success", async () => {
  const calls = [];
  const helper = load("src/lib/report-pages.ts", {}, { fetch: async (url, init) => {
    calls.push({ url, init });
    return Response.json(calls.length === 1 ? { success: true, data: [{ id: "new" }], pagination: { nextCursor: "old" } } : { success: true, data: [{ id: "old" }] });
  } });
  const result = await helper.fetchReportPages("/api/reports?status=PENDING&light=1", "token");
  assert.equal((await result.json()).data.length, 2);
  assert.match(calls[1].url, /status=PENDING&light=1&cursor=old/);
  assert.equal(calls[1].init.headers.Authorization, undefined);
  assert.equal(calls[1].init.headers["X-VaultQ-Session"], "token");
  const failure = load("src/lib/report-pages.ts", {}, { fetch: async url => url.includes("cursor=") ? Response.json({ success: false }, { status: 503 }) : Response.json({ success: true, data: [{ id: "new" }], pagination: { nextCursor: "old" } }) });
  assert.equal((await failure.fetchReportPages("/api/reports", "token")).status, 503);
});

test("reports API returns a continuation cursor and keeps owner filters on later pages", async () => {
  let query;
  const route = load("src/app/api/reports/route.ts", {
    "next/server": server, "@/lib/auth": { authenticateRequest: async () => ({ id: "student", role: "STUDENT" }) },
    "@/lib/prisma": { prisma: { report: { findMany: async input => { query = input; return Array.from({ length: 201 }, (_, i) => ({ id: `report-${i}`, item: null })); } } } },
    "@/lib/match-notification-service": {}, "@/lib/image-validation": {}, "@/lib/categories": {}, "@/lib/notification-service": {}, "@/lib/report-include": {},
    "@/lib/report-validation": { VALID_REPORT_TYPES: ["LOST", "FOUND"] }, "@/lib/image-url": {}, "@/lib/photo-gallery": {}, "@/lib/auth-rate-limit": limits,
  });
  const result = await route.GET({ url: "https://test/api/reports?type=LOST&cursor=previous" });
  assert.equal(result.body.data.length, 200);
  assert.equal(result.body.pagination.nextCursor, "report-199");
  assert.equal(query.where.userId, "student");
  assert.equal(query.where.type, "LOST");
  assert.equal(query.cursor.id, "previous");
  assert.equal(query.skip, 1);
  assert.equal(query.take, 201);
});

test("report validation allows numeric names/locations but rejects impossible dates", () => {
  const validation = load("src/lib/report-validation.ts", { "./categories": { isItemCategory: () => true } });
  const details = { itemName: "3M headphones", description: "2 silver stickers on the case", location: "101 Block A", date: "2024-02-29" };
  assert.equal(validation.validateReportDetails(details).ok, true);
  for (const date of ["2026-02-30", "2025-02-29", "2026-13-01"]) assert.equal(validation.validateReportDetails({ ...details, date }).ok, false);
});

test("workload throttling rejects requests before parsing uploads or scanning inventory", async () => {
  let reads = 0;
  const blocked = { enforceAuthRateLimit: async (_request, _action, identity) => { assert.equal(identity, "student"); return { status: 429 }; } };
  const deps = {
    "next/server": server, "@/lib/auth": { authenticateRequest: async () => ({ id: "student", role: "STUDENT" }) },
    "@/lib/prisma": { prisma: new Proxy({}, { get() { reads++; throw new Error("Unexpected database access"); } }) },
    "@/lib/auth-rate-limit": blocked, "@/lib/match-notification-service": {}, "@/lib/image-validation": {},
    "@/lib/notification-service": {}, "@/lib/report-include": {}, "@/lib/report-validation": {}, "@/lib/image-url": {},
    "@/lib/photo-gallery": {}, "@/lib/categories": {}, "@/lib/claim-validation": {}, "@/lib/claim-transition-service": {},
    "@/lib/report-match": {}, "@/lib/item-mapper": {}, "@/lib/claim-review-service": {},
  };
  const request = { json: async () => { throw new Error("Must not parse input"); }, formData: async () => { throw new Error("Must not parse uploads"); } };
  for (const [file, method] of [
    ["src/app/api/reports/route.ts", "POST"], ["src/app/api/claims/route.ts", "POST"],
    ["src/app/api/claims/[id]/resubmit/route.ts", "POST"], ["src/app/api/reports/[id]/route.ts", "PATCH"],
    ["src/app/api/reports/[id]/suggestions/route.ts", "GET"],
  ]) assert.equal((await load(file, deps)[method](request, { params: Promise.resolve({ id: "record" }) })).status, 429, file);
  assert.equal(reads, 0);
});

test("no-photo resubmission endpoint enforces the same exception as initial claims", async () => {
  const inputs = [];
  const route = load("src/app/api/claims/[id]/resubmit/route.ts", {
    "next/server": server, "@/lib/auth": { authenticateRequest: async () => ({ id: "student", role: "STUDENT" }) },
    "@/lib/prisma": { prisma: { claim: { findUnique: async () => ({ id: "claim", userId: "student", status: "REJECTED" }) } } },
    "@/lib/auth-rate-limit": limits, "@/lib/claim-validation": { NO_PHOTO_REASON_MIN_LENGTH: 80 },
    "@/lib/image-validation": { normalizeImageSources: async () => [] },
    "@/lib/claim-transition-service": { resubmitRejectedClaim: async (_id, _owner, input) => { inputs.push(input); return { status: "PENDING" }; } },
  });
  for (const [consent, length, expected] of [["false", 80, 400], ["true", 79, 400], ["true", 80, 200]]) {
    const form = new FormData();
    form.set("claimReason", "x".repeat(length)); form.set("noPhoto", consent);
    assert.equal((await route.POST({ formData: async () => form }, { params: Promise.resolve({ id: "claim" }) })).status, expected);
  }
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].noPhoto, true);
  assert.equal(inputs[0].evidenceImageUrls.length, 0);
});

test("locker UI never substitutes demo data or pretends offline writes succeeded", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/dashboard/admin/lockers/page.tsx"), "utf8");
  assert.doesNotMatch(source, /initialLockers|mockFoundItems|using mock data|local-\$\{/);
  assert.match(source, /Changes are disabled until the connection is restored/);
  assert.match(source, /Lockers are not connected/);
});
