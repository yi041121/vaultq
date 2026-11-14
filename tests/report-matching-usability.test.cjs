/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, console, Date, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const matcher = load("src/lib/report-match.ts");
const workflow = load("src/lib/student-workflow.ts");
const report = { itemName: "Black backpack", category: "Bags", description: "Broken zipper and silver keyring", location: "Library", date: "2026-11-12" };
const candidate = { id: "item-1", itemName: "Black bag", category: "Bags", description: "Broken zipper and silver keyring", foundLocation: "Library", foundDate: "2026-11-13" };

test("category, date, location and colour alone cannot suggest unrelated items", () => {
  for (const itemName of ["Black suitcase", "Blue purse", "Large tote"]) {
    assert.equal(matcher.suggestMatches({ ...report, description: "" }, [{ ...candidate, itemName, description: "" }]).length, 0);
  }
});

test("common item synonyms and plurals share the same explainable scoring", () => {
  for (const itemName of ["Black backpack", "Black bags", "Black rucksack"]) {
    const results = matcher.suggestMatches({ ...report, itemName }, [candidate]);
    assert.equal(results.length, 1);
    assert.equal(results[0].score, 100);
    assert.ok(results[0].reasons.includes("Similar identifying details"));
  }
  assert.equal(matcher.suggestMatches({ itemName: "Smartphone" }, [{ id: "phone", itemName: "Phone" }]).length, 1);
});

test("descriptive details can connect differently named items but generic words cannot", () => {
  const renamed = { ...candidate, itemName: "Ripped satchel" };
  assert.equal(matcher.suggestMatches(report, [renamed]).length, 1);
  assert.equal(matcher.suggestMatches({ ...report, description: "This item was lost and it is black" }, [{ ...renamed, description: "This item was found and it is black" }]).length, 0);
});

test("matching handles Unicode and does not confuse name substrings or object keys", () => {
  assert.equal(matcher.suggestMatches({ itemName: "蓝色背包" }, [{ id: "unicode", itemName: "蓝色背包" }]).length, 1);
  assert.equal(matcher.suggestMatches({ itemName: "Pen" }, [{ id: "pencil", itemName: "Pencil" }]).length, 0);
  assert.equal(matcher.suggestMatches({ itemName: "Constructor" }, [{ id: "safe", itemName: "Constructor" }]).length, 1);
});

test("descriptions improve rank, exclusions and limits work, and ties are stable", () => {
  const results = matcher.suggestMatches(report, [{ ...candidate, id: "b", description: "" }, { ...candidate, id: "a" }]);
  assert.equal(results[0].itemId, "a");
  assert.ok(results[0].score > results[1].score);
  assert.equal(matcher.suggestMatches(report, [candidate], { excludeItemId: candidate.id }).length, 0);
  assert.equal(matcher.suggestMatches(report, [candidate], { limit: 0 }).length, 0);
  const tied = matcher.suggestMatches(report, [{ ...candidate, id: "b" }, { ...candidate, id: "a" }], { limit: 1 });
  assert.equal(tied[0].itemId, "a");
});

test("invalid calendar dates earn no date proximity points", () => {
  const results = matcher.suggestMatches({ ...report, date: "2026-02-30" }, [{ ...candidate, foundDate: "2026-03-02" }]);
  assert.ok(!results[0].reasons.some((reason) => reason.includes("Found within")));
});

function suggestionsHarness(options = {}) {
  const calls = [];
  const signed = [];
  const items = options.items ?? [candidate];
  const route = load("src/app/api/reports/[id]/suggestions/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    "@/lib/auth": { authenticateRequest: async () => options.user === undefined ? { id: "owner", role: "STUDENT" } : options.user },
    "@/lib/prisma": { prisma: {
      report: {
        findUnique: async () => options.missing ? null : ({ ...report, id: "report-1", userId: "owner", type: "LOST", status: "PENDING", itemId: null, ...options.report }),
        findMany: async () => options.ownReports ?? [],
      },
      claim: { findMany: async () => options.claims ?? [] },
      item: { findMany: async (query) => {
        calls.push(query);
        if (!query.where.id) return items;
        return items.filter((item) => query.where.id.in.includes(item.id) && item.id !== options.unavailableId).map((item) => ({ id: item.id, imageUrl: `private-photo-${item.id}` }));
      } },
    } },
    "@/lib/image-url": { signedImageUrl: (...args) => { signed.push(args); return `/signed/${args[1]}`; } },
    "@/lib/report-match": matcher,
    "@/lib/item-mapper": { toDateOnly: (value) => value ?? "" },
  });
  return { get: () => route.GET({}, { params: Promise.resolve({ id: "report-1" }) }), calls, signed };
}

test("suggestion endpoint enforces authentication, role, report ownership and existence", async () => {
  for (const [options, expected] of [[{ user: null }, 401], [{ user: { id: "admin", role: "ADMIN" } }, 403], [{ report: { userId: "other" } }, 403], [{ missing: true }, 404]]) {
    const h = suggestionsHarness(options);
    assert.equal((await h.get()).status, expected);
    assert.equal(h.calls.length, 0);
  }
});

test("only unlinked pending lost reports offer new claims", async () => {
  for (const state of [{ type: "FOUND" }, { status: "CLOSED" }, { status: "MATCHED" }, { status: "REJECTED" }, { itemId: "linked" }]) {
    const h = suggestionsHarness({ report: state });
    assert.equal((await h.get()).body.data.length, 0);
    assert.equal(h.calls.length, 0);
  }
});

test("old inventory beyond 200 entries is considered without loading every image", async () => {
  const unrelated = Array.from({ length: 200 }, (_, i) => ({ ...candidate, id: `recent-${i}`, itemName: "Purse", description: "" }));
  const h = suggestionsHarness({ items: [...unrelated, { ...candidate, id: "older-match" }] });
  const response = await h.get();
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].id, "older-match");
  assert.equal(response.body.data[0].imageUrl, "/signed/older-match");
  assert.equal(h.calls[0].take, undefined);
  assert.equal(h.calls[0].select.imageUrl, undefined);
  assert.equal(h.calls[1].where.id.in.length, 1);
  assert.equal(h.signed.length, 1);
});

test("suggestions exclude own found reports, existing claims and newly unavailable items", async () => {
  for (const options of [{ ownReports: [{ itemId: "item-1" }] }, { claims: [{ itemId: "item-1" }] }, { unavailableId: "item-1" }]) {
    const h = suggestionsHarness(options);
    assert.equal((await h.get()).body.data.length, 0);
    assert.equal(h.signed.length, 0);
  }
});

test("next-step guidance never treats a report match or pending claim as collection approval", () => {
  assert.match(workflow.reportNextStep("LOST", "PENDING"), /check possible matches/);
  assert.match(workflow.reportNextStep("FOUND", "PENDING"), /hand the item/);
  assert.match(workflow.reportNextStep("LOST", "MATCHED"), /does not mean you can collect/);
  assert.match(workflow.reportNextStep("LOST", "CLOSED"), /check My Claims/);
  assert.match(workflow.claimNextStep("Pending"), /do not collect/);
  assert.match(workflow.claimNextStep("QR Ready"), /Approved/);
  assert.match(workflow.claimNextStep("Rejected"), /read the rejection reason/);
});

test("student matches can be reopened and admin confirmation describes the real approval action", () => {
  const student = fs.readFileSync(path.join(__dirname, "../src/app/dashboard/student/report/page.tsx"), "utf8");
  assert.match(student, /Check possible matches/);
  assert.match(student, /report\.status === "PENDING" && !report\.item/);
  assert.match(student, /report: activeSuggestionReportId/);
  assert.match(student, /Back to my reports/);
  assert.doesNotMatch(student, /\{suggestion\.score\}%/);
  assert.match(student, /requestId === suggestionRequestRef\.current/);
  for (const screen of ["claims", "reports"]) {
    const admin = fs.readFileSync(path.join(__dirname, `../src/app/dashboard/admin/${screen}/page.tsx`), "utf8");
    assert.match(admin, /confirmLabel="Match & approve"/);
    assert.match(admin, /Confirm only after verifying ownership/);
    assert.match(admin, /Competing pending claims/);
    assert.match(admin, /matchItemsError/);
    assert.match(admin, /reasons\.join/);
    assert.doesNotMatch(admin, /pending claim created for review/);
  }
});
