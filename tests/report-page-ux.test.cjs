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
  // Reports list improvements: the card keeps a glanceable summary and the
  // popup carries the reference, gallery, admin note and guidance.
  assert.match(card, /line-clamp-2/);
  assert.match(source, /reference: report\.reference/);
  assert.match(source, /adminNote: report\.adminNote/);
  assert.match(source, /nextStep: reportNextStep/);
  assert.match(source, /role="note"/);
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

test("My Reports keeps search and its filters in a compact hover-expandable layout", () => {
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
  assert.match(toolbar, /width="w-\[180px\]"/);
  assert.match(toolbar, /dense active=\{entry\.value === status\}/);

  // Status, type and reset share one phone row instead of stacking.
  assert.match(toolbar, /flex min-w-0 flex-col gap-2 sm:flex-row/, "search keeps its own row");
  assert.match(toolbar, /flex min-w-0 items-center gap-1\.5 sm:gap-2/, "filter controls share one row");
  assert.match(toolbar, /className="min-w-0 flex-1 sm:flex-none"/, "status takes the remaining phone width");
  assert.match(toolbar, /\{trailing\}/);
  assert.match(panel, /trailing=\{/);
  assert.match(panel, /className="w-\[108px\] justify-between sm:w-\[124px\]"/, "type stays compact");

  // Shared reset control, icon-sized on phones so it fits beside them.
  assert.match(panel, /<ResetFiltersButton compact disabled=\{!reportFiltersActive\} onClick=\{resetReportFilters\} \/>/);
  const filters = fs.readFileSync(path.join(ROOT, "src/components/filter-panel.tsx"), "utf8");
  assert.match(filters, /compact \? "w-9 px-0 sm:w-auto sm:px-3" : "px-3"/);
  assert.match(filters, /className=\{compact \? "hidden sm:inline" : undefined\}/);

  // Both dropdowns auto-open on hover because they live in a filter panel.
  const vault = fs.readFileSync(path.join(ROOT, "src/components/ui/vault.tsx"), "utf8");
  assert.match(vault, /closest\("\[data-filter-panel\]"\)/);
  assert.match(vault, /onPointerEnter/);
});

test("My Reports only offers statuses the type can reach", () => {
  // All types shows shared statuses, not a union of type-specific options.
  const values = (type) => [...filter.reportStatusFilters(type)].map((entry) => entry.value);
  assert.deepEqual(values("ALL"), ["ALL", "PENDING", "REJECTED"]);
  assert.deepEqual(values("LOST"), ["ALL", "PENDING", "MATCHED_CLOSED", "REJECTED"]);
  assert.deepEqual(values("FOUND"), ["ALL", "PENDING", "VERIFIED", "REJECTED"]);
  assert.equal(filter.statusIsAvailableFor("FOUND", "MATCHED"), false);
  assert.equal(filter.statusIsAvailableFor("FOUND", "CLOSED"), false);
  assert.equal(filter.statusIsAvailableFor("LOST", "VERIFIED"), false);
  assert.equal(filter.statusIsAvailableFor("LOST", "PENDING"), true);
  assert.equal(filter.statusIsAvailableFor("ALL", "MATCHED_CLOSED"), false);
  assert.equal(filter.statusIsAvailableFor("FOUND", "MATCHED_CLOSED"), false);
  assert.equal(filter.statusIsAvailableFor("LOST", "MATCHED_CLOSED"), true);

  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  assert.match(page, /useState<ReportStatusFilter>\("ALL"\)/, "all statuses is the default");
  assert.match(page, /useState<ReportTypeFilter>\("ALL"\)/, "all types is the default filter");
  assert.match(page, /function statusForKind/, "kind changes normalise the status filter");
  assert.match(page, /statusForKind\(kind, current\)/, "URL-driven kind changes are normalised too");
  assert.match(page, /type=\{reportKind\}/);

  const toolbar = fs.readFileSync(path.join(ROOT, "src/components/student/report-list-toolbar.tsx"), "utf8");
  assert.match(toolbar, /reportStatusFilters\(type\)/);
  assert.doesNotMatch(toolbar, /REPORT_STATUS_FILTERS\.map/);
});

test("the combined lost-report filter includes both Matched and Closed without changing their statuses", () => {
  const reports = [
    report({ id: "matched", status: "MATCHED" }),
    report({ id: "closed", status: "CLOSED" }),
    report({ id: "pending", status: "PENDING" }),
    report({ id: "rejected", status: "REJECTED" }),
    report({ id: "verified", type: "FOUND", status: "VERIFIED" }),
  ];
  const filtered = filter.filterReports(reports, { type: "LOST", status: "MATCHED_CLOSED", query: "backpack" });
  assert.deepEqual(filtered.map(r => r.id), ["matched", "closed"]);
  assert.equal(reports[0].status, "MATCHED", "filtering must not rewrite workflow state");
  assert.equal(reports[1].status, "CLOSED");
  assert.deepEqual(filter.filterReports(reports, { type: "FOUND", status: "MATCHED_CLOSED", query: "" }), []);
});

test("switching report type clears incompatible statuses to All, not Pending", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  const start = page.indexOf("function statusForKind(");
  const end = page.indexOf("\n}", start) + 2;
  const normalizer = {};
  vm.runInNewContext(ts.transpileModule(page.slice(start, end) + "\nexports.normalize = statusForKind;", {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: normalizer, statusIsAvailableFor: filter.statusIsAvailableFor });
  assert.equal(normalizer.normalize("FOUND", "MATCHED_CLOSED"), "ALL");
  assert.equal(normalizer.normalize("LOST", "VERIFIED"), "ALL");
  assert.equal(normalizer.normalize("ALL", "VERIFIED"), "ALL");
  assert.equal(normalizer.normalize("ALL", "MATCHED_CLOSED"), "ALL");
  assert.equal(normalizer.normalize("FOUND", "REJECTED"), "REJECTED");
  assert.equal(normalizer.normalize("LOST", "ALL"), "ALL");
});

test("phone latest items use a keyboard-accessible horizontal slider while desktop retains its grid", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/page.tsx"), "utf8");
  assert.match(page, /role="region" aria-labelledby="latest-found-items-title" tabIndex=\{0\}/);
  assert.match(page, /grid-flow-col auto-cols-\[85%\] overflow-x-auto overscroll-x-contain snap-x snap-mandatory/);
  assert.match(page, /sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible sm:snap-none/);
  assert.match(page, /key=\{item.id\} className="min-w-0 snap-start/);
  assert.match(page, /Swipe left or right to browse/);
  assert.doesNotMatch(page, /snap-y|max-h-\[min\(60dvh/);
  assert.doesNotMatch(page, /setInterval|autoplay/i, "never move items automatically while reading");
});

test("the status field stays white for Pending and turns blue only when narrowed", () => {
  const toolbar = fs.readFileSync(path.join(ROOT, "src/components/student/report-list-toolbar.tsx"), "utf8");
  assert.match(toolbar, /const narrowed = status !== "PENDING" && status !== "ALL"/);
  assert.match(toolbar, /style=\{narrowed \? \{ borderColor: c\.primary, color: c\.primary, backgroundColor: c\.primarySoft \} : undefined\}/);
  assert.doesNotMatch(toolbar, /active=\{status !== "ALL"\}/, "the trigger must not use the toggle style");
});

test("Reset filters restores the default All types / All statuses view", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  const reset = page.match(/function resetReportFilters\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(reset, /setReportKind\("ALL"\)/);
  assert.match(reset, /setReportStatus\("ALL"\)/);
  assert.match(reset, /setReportQuery\(""\)/);
  // "Reset" is only enabled once the view differs from those defaults.
  assert.match(page, /reportKind !== "ALL" \|\| reportStatus !== "ALL" \|\| reportQuery\.trim\(\)\.length > 0/);
  // The empty-state "Clear filters" uses the same reset.
  assert.match(page, /onClick=\{resetReportFilters\}/);
});

test("Check matches opens a popup instead of replacing the report list", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  // The list no longer hides behind the matches view.
  assert.doesNotMatch(page, /tab === "reports" && !matchesReport/);
  assert.doesNotMatch(page, /tab === "reports" && !matchesReport \?/);
  assert.match(page, /\{tab === "reports" \? \(/);
  // Matches live in their own dialog, closed with an X.
  const modal = page.slice(page.indexOf("{matchesReport && ("));
  assert.match(modal, /fixed inset-0 z-\[55\]/);
  assert.match(modal, /<ReportMatchesPanel/);
  assert.match(modal, /onClose=\{\(\) => setMatchesReport\(null\)\}/);
  // The suggestion popup keeps its centred Start claim / Close footer.
  assert.match(page, /className="flex w-full items-center justify-center gap-2"/);
});

test("matches popup closes with an X and no separate count", () => {
  const panel = fs.readFileSync(path.join(ROOT, "src/components/student/report-matches-panel.tsx"), "utf8");
  assert.doesNotMatch(panel, /Back to my reports/);
  assert.doesNotMatch(panel, /suggestions\.length\} found/);
  assert.match(panel, /aria-label="Close matches"/);
  assert.match(panel, /<X size=\{16\} \/>/);
  const card = fs.readFileSync(path.join(ROOT, "src/components/student/report-card.tsx"), "utf8");
  assert.doesNotMatch(card, /matchCount/);
  assert.match(card, /Check matches/);
});

test("the lost-report link form only appears for related items", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/search/page.tsx"), "utf8");
  assert.match(page, /suggestMatches\(/);
  assert.match(page, /const related = reports\.filter/);
  assert.match(page, /if \(related\.length > 0\)/);
  assert.match(page, /\{linkPromptReports\.map/);
});

test("newly added inventory notifies matching pending lost reports", () => {
  const items = fs.readFileSync(path.join(ROOT, "src/app/api/items/route.ts"), "utf8");
  assert.match(items, /await notifyInventoryMatches\(\{ itemId: created\.id \}, tx\)/);
  const reports = fs.readFileSync(path.join(ROOT, "src/app/api/reports/route.ts"), "utf8");
  assert.match(reports, /if \(type === "LOST"\) await notifyInventoryMatches\(\{ reportId: created\.id \}, tx\)/);
  const verify = fs.readFileSync(path.join(ROOT, "src/app/api/reports/[id]/verify/route.ts"), "utf8");
  assert.match(verify, /notifyInventoryMatches\(\{ itemId:/);
});

test("withdrawing a report leaves a notification receipt", () => {
  const route = fs.readFileSync(path.join(ROOT, "src/app/api/reports/[id]/route.ts"), "utf8");
  const withdraw = route.slice(route.indexOf("export async function DELETE"));
  assert.match(withdraw, /notifyUser\(/, "the student is notified");
  assert.match(withdraw, /"Report withdrawn"/);
  assert.match(withdraw, /type: true, itemName: true/, "the message uses the report type and item");
  assert.match(withdraw, /link: "\/dashboard\/student\/report\?tab=reports"/);
});

test("report cards show a glanceable summary and defer the rest to the popup", () => {
  const card = fs.readFileSync(path.join(ROOT, "src/components/student/report-card.tsx"), "utf8");
  assert.doesNotMatch(card, /showsItemFirst/, "there is only one card layout");

  // A glance: photo, name, when/where/category, status and a short description.
  assert.match(card, /report\.images\[0\] \|\| report\.item\?\.imageUrl/);
  assert.match(card, /line-clamp-2/);
  for (const marker of ["report.itemName", "report.statusLabel", "fmtDate(report.date)", "report.category", "View details"]) {
    assert.ok(card.includes(marker), `card shows ${marker}`);
  }
  // An admin note is the one extra block that stays visible.
  assert.match(card, /Admin note:/);

  // The heavier details stay in the popup.
  assert.doesNotMatch(card, /report\.reference/);
  assert.doesNotMatch(card, /reportNextStep/);
  assert.doesNotMatch(card, /Report photos/);
  assert.doesNotMatch(card, /onEdit|onWithdraw/, "edit/withdraw moved into the popup");

  // At most two actions on a card: one contextual action plus View details.
  assert.ok((card.match(/<VButton/g) ?? []).length <= 3, "cards keep only the contextual action and View details");
  assert.match(card, /Check matches/);

  // The reviewer line and a bordered description live on the card now.
  assert.match(card, /Reviewed by admin/);
  assert.match(card, /report\.reviewedAt/);
  assert.match(card, /rounded-xl border px-3 py-2\.5/);
  assert.match(card, /borderColor: c\.border, backgroundColor: c\.fill/);
  // Reviewer label/date on the left; actions stay on the right.
  const actionRow = card.indexOf("mt-3 flex min-w-0 flex-wrap items-center gap-3");
  assert.ok(actionRow > 0, "reviewer and action row exists");
  const actions = card.slice(actionRow);
  assert.ok(actions.indexOf("Reviewed by admin") < actions.indexOf("View details"), "reviewer comes first, on the left");
  assert.match(actions, /ml-auto flex max-w-full flex-wrap items-center justify-end gap-2/);
  assert.match(actions, /Reviewed by admin<\/p>[\s\S]{0,160}<time className="vq-date">/);

  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  assert.doesNotMatch(page, /Reviewed by admin/, "the popup no longer repeats the reviewer line");
  for (const field of ["description: report.description", "images: report.images", "reference: report.reference", "adminNote: report.adminNote", "nextStep: reportNextStep"]) {
    assert.ok(page.includes(field), `details include ${field}`);
  }
  assert.match(page, /<ItemDetailsModal/);
  assert.match(page, /notice=\{/);
  // Edit and withdraw are now reachable from the details popup.
  assert.match(page, /void openEdit\(report\)/);
  assert.match(page, /setWithdrawTarget\(report\)/);
});

test("My Reports cards and popups wrap long content instead of overflowing narrow phones", () => {
  const card = fs.readFileSync(path.join(ROOT, "src/components/student/report-card.tsx"), "utf8");
  assert.match(card, /w-full min-w-0 p-4/);
  assert.match(card, /flex min-w-0 flex-wrap items-start/);
  assert.match(card, /flex-1 basis-40/);
  assert.match(card, /min-w-0 \[overflow-wrap:anywhere\]/);
  assert.match(card, /max-w-full flex-wrap items-center justify-end/);
  const page = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/report/page.tsx"), "utf8");
  assert.match(page, /grid min-w-0 grid-cols-1 items-start/);
  const matches = fs.readFileSync(path.join(ROOT, "src/components/student/report-matches-panel.tsx"), "utf8");
  assert.match(matches, /\[overflow-wrap:anywhere\]/);
  assert.match(matches, /flex max-w-full flex-wrap items-center gap-2/);
  const details = fs.readFileSync(path.join(ROOT, "src/components/item-details-modal.tsx"), "utf8");
  assert.match(details, /w-full min-w-0/);
  assert.match(details, /min-w-0 flex-1 text-lg/);
});
