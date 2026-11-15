/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const ROOT = path.join(__dirname, "..");

function load(file, deps = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date, JSON, console, ...globals,
    require(name) {
      assert.ok(name in deps, `Unexpected dependency: ${name}`);
      return deps[name];
    },
  });
  return exports;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    get size() { return values.size; },
    raw: values,
  };
}

const form = load("src/lib/report-form.ts");

const base = {
  type: "LOST",
  itemName: "Black backpack",
  category: "Bags",
  description: "Black backpack with a broken left strap and silver keyring",
  location: "Library 3rd floor",
  date: "2026-11-14",
};

test("report form validation mirrors the API rules and blocks future dates", () => {
  assert.equal(Object.keys(form.validateReportForm(base)).length, 0);
  for (const [patch, field] of [
    [{ itemName: "A" }, "itemName"],
    [{ category: null }, "category"],
    [{ description: "tiny" }, "description"],
    [{ location: "" }, "location"],
    [{ date: "" }, "date"],
  ]) {
    assert.ok(form.validateReportForm({ ...base, ...patch })[field], `expected ${field} error`);
  }
  const future = form.validateReportForm({ ...base, date: "2999-01-01" });
  assert.match(future.date, /future/);
});

test("impossible calendar dates are rejected but valid past dates pass", () => {
  for (const date of ["2026-02-30", "2025-02-29", "2026-13-01", "not-a-date"]) {
    assert.ok(form.validateReportForm({ ...base, date }).date, date);
  }
  assert.equal(form.validateReportForm({ ...base, date: "2024-02-29" }).date, undefined);
});

test("drafts round-trip in tab storage and ignore another account", () => {
  const sessionStorage = memoryStorage();
  const drafts = load("src/lib/report-draft.ts", {}, { window: { sessionStorage } });
  const draft = { owner: "session-a", ...base, type: "LOST", savedAt: 1 };
  drafts.saveReportDraft(draft);
  const loaded = drafts.loadReportDraft("session-a");
  assert.equal(loaded.itemName, base.itemName);
  assert.equal(loaded.type, "LOST");
  assert.equal(drafts.loadReportDraft("session-b"), null, "another session must not see the draft");

  drafts.clearReportDraft();
  assert.equal(drafts.loadReportDraft("session-a"), null);
});

test("empty, malformed and photo-less drafts are handled safely", () => {
  const sessionStorage = memoryStorage();
  const drafts = load("src/lib/report-draft.ts", {}, { window: { sessionStorage } });
  assert.equal(drafts.hasDraftContent({ itemName: " ", category: null, description: " ", location: "", date: "" }), false);
  drafts.saveReportDraft({ owner: "s", type: "LOST", itemName: "   ", category: null, description: "", location: "", date: "" });
  assert.equal(drafts.loadReportDraft("s"), null, "blank drafts are not stored");
  sessionStorage.setItem("vaultq:report-draft", "{not json");
  assert.equal(drafts.loadReportDraft("s"), null);
  sessionStorage.setItem("vaultq:report-draft", JSON.stringify({ owner: "s", type: "LOST", itemName: 5 }));
  assert.equal(drafts.loadReportDraft("s"), null);
});

test("drafts never serialise photos or credentials", () => {
  const sessionStorage = memoryStorage();
  const drafts = load("src/lib/report-draft.ts", {}, { window: { sessionStorage } });
  drafts.saveReportDraft({ owner: "s", ...base, type: "LOST", photos: [{ file: {} }], token: "secret" });
  const raw = sessionStorage.getItem("vaultq:report-draft");
  assert.ok(raw);
  assert.doesNotMatch(raw, /photos|token|secret/);
});

test("report page implements dialog semantics, inline errors and draft recovery", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  const card = fs.readFileSync(path.join(ROOT, "src/components/student/report-card.tsx"), "utf8");
  // The removed explainer must not come back.
  assert.doesNotMatch(source, /Claim:<\/strong> request a specific found item/);
  // Dialog + focus management.
  assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="report-form-title"/);
  assert.match(source, /onKeyDown=\{trapFocus\}/);
  assert.match(source, /formHeadingRef\.current\?\.focus/);
  assert.match(source, /choiceRefs\.current\[closingType\]\?\.focus/);
  assert.match(source, /body\.style\.overflow = "hidden"/);
  // Escape closes the report form instead of being ignored.
  assert.match(source, /event\.key !== "Escape"/);
  // Labels and inline errors are wired for assistive technology.
  for (const field of ["report-item-name", "report-location", "report-description"]) {
    assert.match(source, new RegExp(`htmlFor="${field}"`), field);
    assert.match(source, new RegExp(`id="${field}"`), field);
  }
  assert.match(source, /aria-invalid=\{!!formErrors\./);
  assert.match(source, /role="alert"/);
  // Submit stays enabled and validates instead of silently disabling.
  assert.match(source, /disabled=\{submitting\}/);
  assert.doesNotMatch(source, /disabled=\{!formValid/);
  // Draft recovery.
  assert.match(source, /loadReportDraft/);
  assert.match(source, /saveReportDraft/);
  assert.match(source, /Continue your saved draft\?/);
  assert.match(source, /clearReportDraft\(\)/);
  // Reports list improvements.
  assert.match(card, /report\.reference/);
  assert.match(card, /Admin note:/);
  assert.match(card, /role="note"/);
});

test("centred messages are announced and errors stay longer", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/components/centered-message.tsx"), "utf8");
  assert.match(source, /role=\{isError \? "alert" : "status"\}/);
  assert.match(source, /aria-live=\{isError \? "assertive" : "polite"\}/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /kind === "error" \? 4000 : 1800/);
});

const filter = load("src/lib/report-list-filter.ts");

function report(overrides) {
  return {
    id: "r", reference: "RPT-AAAA1111", type: "LOST", status: "PENDING",
    itemName: "Black backpack", category: "Bags", description: "Broken strap",
    location: "Library", item: null, studentName: "Student", ...overrides,
  };
}
test("report list filters by type, status and every search token", () => {
  const reports = [
    report({ id: "1" }),
    report({ id: "2", status: "REJECTED", itemName: "Blue bottle", category: "Water Bottles", location: "Cafeteria", reference: "RPT-BBBB2222" }),
    report({ id: "3", type: "FOUND", itemName: "Silver phone", item: { name: "Silver phone" }, reference: "RPT-CCCC3333" }),
  ];
  const ids = (filters) => filter.filterReports(reports, { type: "LOST", status: "ALL", query: "", ...filters }).map((r) => r.id);
  assert.deepEqual(ids({}), ["1", "2"]);
  assert.deepEqual(ids({ status: "PENDING" }), ["1"]);
  assert.deepEqual(ids({ query: "library" }), ["1"]);
  assert.deepEqual(ids({ query: "black library" }), ["1"]);
  assert.deepEqual(ids({ query: "black cafeteria" }), [], "all tokens must match");
  assert.deepEqual(ids({ query: "rpt-aaaa" }), ["1"], "reference is searchable");
  assert.deepEqual(ids({ status: "ALL", query: "" , type: "FOUND" }), ["3"]);
  assert.deepEqual(ids({ status: "ALL", query: "", type: "ALL" }), ["1", "2", "3"], "All types merges lost and found");
  assert.equal(filter.filtersAreActive({ status: "ALL", query: "  " }), false);
  assert.equal(filter.filtersAreActive({ status: "PENDING", query: "" }), true);
});

test("My Reports exposes status/search controls and duplicate recovery", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  assert.match(page, /<ReportListToolbar/);
  assert.match(page, /filterReports\(reports/);
  assert.match(page, /No reports match your filters/);
  assert.match(page, /You already have a pending report/);
  assert.match(page, /setReportStatus\("PENDING"\)/);
  assert.match(page, /already have a pending report/);
  assert.match(page, /<ReportCard/);
  assert.match(page, /<ReportMatchesPanel/);
  assert.match(page, /<ReportTypeChooser/);
});

test("search uses the pill style and hover-to-type only cancels while empty", () => {
  const pill = fs.readFileSync(path.join(ROOT, "src/components/pill-search-input.tsx"), "utf8");
  assert.match(pill, /rounded-full/);
  assert.match(pill, /right-4 top-1\/2/, "search icon sits on the right");
  assert.match(pill, /onPointerEnter=\{handlePointerEnter\}/);
  assert.match(pill, /onPointerLeave=\{handlePointerLeave\}/);
  assert.match(pill, /hoverFocused\.current && !input\.value/, "leaving only blurs an untouched field");
  assert.match(pill, /anotherFieldIsFocused/, "hover never steals focus from another field");
  assert.match(pill, /pointerType === "mouse"/, "touch devices keep tap focus");

  // The X clears on the first click: pointerdown keeps focus on the input, so
  // the click is never swallowed by a focus change.
  assert.match(pill, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(pill, /onChange\(""\)/);
  assert.match(pill, /title="Clear search"/);

  const searchPage = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/search/page.tsx"), "utf8");
  assert.match(searchPage, /<PillSearchInput/);
  assert.doesNotMatch(searchPage, /<VSearchInput/);

  const toolbar = fs.readFileSync(path.join(ROOT, "src/components/student/report-list-toolbar.tsx"), "utf8");
  assert.match(toolbar, /<PillSearchInput/);
  assert.match(pill, /style=\{\{ color: colors\.primary \}\}/, "search icon uses the system primary blue");
  assert.doesNotMatch(pill, /#3b82f6/, "no hard-coded off-brand blue");
});

test("every search box in the app uses the shared pill style", () => {
  const vault = fs.readFileSync(path.join(ROOT, "src/components/ui/vault.tsx"), "utf8");
  assert.match(vault, /export function VSearchInput/);
  assert.match(vault, /<PillSearchInput/, "VSearchInput delegates to the shared field");
  assert.doesNotMatch(vault, /<Search size=/, "no separate left-icon search field remains");

  // Old call sites keep working, so the whole app shares one look.
  for (const page of [
    "src/app/dashboard/student/claims/page.tsx",
    "src/app/dashboard/student/notifications/page.tsx",
    "src/app/dashboard/admin/items/page.tsx",
    "src/app/dashboard/admin/claims/page.tsx",
    "src/app/dashboard/admin/lockers/page.tsx",
    "src/app/dashboard/admin/accounts/page.tsx",
    "src/app/dashboard/admin/reports/page.tsx",
  ]) {
    assert.match(fs.readFileSync(path.join(ROOT, page), "utf8"), /VSearchInput/, `${page} uses the shared field`);
  }
});

test("My Reports puts tabs, search, status and the type dropdown in one hover-expandable row", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  const panel = page.slice(page.indexOf("data-filter-panel"), page.indexOf("<VContentPanel>"));
  assert.match(panel, /border-l/, "divider between New report and My reports");
  assert.match(panel, /<ReportListToolbar/);
  // Lost/Found collapsed into one dropdown so the search field can be longer.
  assert.match(panel, /Filter by report type/);
  assert.match(panel, /<VDropdownItem active=\{reportKind === "ALL"\}/);
  assert.match(panel, /<VDropdownItem active=\{reportKind === "LOST"\}/);
  assert.match(panel, /<VDropdownItem active=\{reportKind === "FOUND"\}/);
  assert.doesNotMatch(panel, /role="group" aria-label="Filter reports by type"/);
  assert.ok(panel.indexOf("<ReportListToolbar") < panel.indexOf("Filter by report type"), "search/status before the type dropdown");
  assert.match(panel, /xl:flex-row/, "tabs and search share one row on wide screens");
  const containers = panel.match(/rounded-2xl border p-2/g) ?? [];
  assert.equal(containers.length, 2, "tabs and the search row each get their own bordered container");

  // The status filter reuses the shared filter button and has no separate
  // Clear control, keeping it consistent with the type dropdown.
  const toolbar = fs.readFileSync(path.join(ROOT, "src/components/student/report-list-toolbar.tsx"), "utf8");
  assert.match(toolbar, /<VFilterButton/);
  assert.doesNotMatch(toolbar, /RotateCcw/);
  assert.doesNotMatch(toolbar, />\s*Clear\s*</);
  assert.doesNotMatch(page, /onReset=\{resetReportFilters\}/);

  // The right-hand container is compact and pinned to the right edge; the
  // search field matches the size used by the other filter bars.
  assert.match(panel, /xl:ml-auto xl:w-fit/);
  assert.match(panel, /sm:justify-end/);
  assert.match(panel, /sm:w-\[360px\]/, "tabs use the standard field width");
  assert.match(toolbar, /lg:w-\[360px\] xl:w-\[420px\]/, "search matches the shared filter bar width");
  assert.match(toolbar, /width="w-\[150px\]"/);
  assert.match(toolbar, /dense active=\{entry\.value === status\}/);

  // Both dropdowns auto-open on hover because they live in a filter panel.
  const vault = fs.readFileSync(path.join(ROOT, "src/components/ui/vault.tsx"), "utf8");
  assert.match(vault, /closest\("\[data-filter-panel\]"\)/);
  assert.match(vault, /onPointerEnter/);
});

test("My Reports defaults to Pending and only offers statuses the type can reach", () => {
  // Lost reports move Pending -> Matched -> Closed/Rejected; found reports
  // move Pending -> Verified/Rejected. All types shows the union.
  const values = (type) => [...filter.reportStatusFilters(type)].map((entry) => entry.value);
  assert.deepEqual(values("ALL"), ["ALL", "PENDING", "MATCHED", "VERIFIED", "REJECTED", "CLOSED"]);
  assert.deepEqual(values("LOST"), ["ALL", "PENDING", "MATCHED", "REJECTED", "CLOSED"]);
  assert.deepEqual(values("FOUND"), ["ALL", "PENDING", "VERIFIED", "REJECTED"]);
  assert.equal(filter.statusIsAvailableFor("FOUND", "MATCHED"), false);
  assert.equal(filter.statusIsAvailableFor("FOUND", "CLOSED"), false);
  assert.equal(filter.statusIsAvailableFor("LOST", "VERIFIED"), false);
  assert.equal(filter.statusIsAvailableFor("LOST", "PENDING"), true);
  assert.equal(filter.statusIsAvailableFor("ALL", "MATCHED"), true);

  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  assert.match(page, /useState<ReportStatusFilter>\("PENDING"\)/, "pending is the default status");
  assert.match(page, /useState<ReportTypeFilter>\("ALL"\)/, "all types is the default filter");
  assert.match(page, /function statusForKind/, "kind changes normalise the status filter");
  assert.match(page, /statusForKind\(kind, current\)/, "URL-driven kind changes are normalised too");
  assert.match(page, /type=\{reportKind\}/);

  const toolbar = fs.readFileSync(path.join(ROOT, "src/components/student/report-list-toolbar.tsx"), "utf8");
  assert.match(toolbar, /reportStatusFilters\(type\)/);
  assert.doesNotMatch(toolbar, /REPORT_STATUS_FILTERS\.map/);
});

test("the status field stays white for Pending and turns blue only when narrowed", () => {
  const toolbar = fs.readFileSync(path.join(ROOT, "src/components/student/report-list-toolbar.tsx"), "utf8");
  assert.match(toolbar, /const narrowed = status !== "PENDING" && status !== "ALL"/);
  assert.match(toolbar, /style=\{narrowed \? \{ borderColor: c\.primary, color: c\.primary, backgroundColor: c\.primarySoft \} : undefined\}/);
  assert.doesNotMatch(toolbar, /active=\{status !== "ALL"\}/, "the trigger must not use the toggle style");
});

