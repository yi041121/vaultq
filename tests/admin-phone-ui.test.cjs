/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadQuickActions() {
  const source = read("src/lib/quick-actions.ts");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: () => new Proxy({}, { get: (_, key) => key }) });
  return exports;
}

const quick = loadQuickActions();

test("admin page actions replace the duplicate top create/edit buttons", () => {
  assert.deepEqual(Array.from(quick.adminQuickActions, action => action.label),
    ["Verify Claims", "Add Item", "Edit Lockers", "Add Student"]);
  assert.deepEqual(Array.from(quick.adminQuickActions, action => action.path), [
    "/dashboard/admin/claims",
    "/dashboard/admin/items?add=1",
    "/dashboard/admin/lockers?edit=1",
    "/dashboard/admin/accounts?add=1",
  ]);
  assert.equal(quick.adminPageQuickAction("Items").label, "Add Item");
  assert.equal(quick.adminPageQuickAction("Items").path, "/dashboard/admin/items?add=1");
  assert.equal(quick.adminPageQuickAction("Lockers").label, "Edit Lockers");
  assert.equal(quick.adminPageQuickAction("Lockers").path, "/dashboard/admin/lockers?edit=1");
  assert.equal(quick.adminPageQuickAction("Accounts").label, "Add Student");
  assert.equal(quick.adminPageQuickAction("Accounts").path, "/dashboard/admin/accounts?add=1");
  assert.equal(quick.adminPageQuickAction("Claims"), null);
  assert.equal(quick.adminPageQuickAction("Dashboard"), null);
});

test("the phone top create/edit buttons are hidden where the floating action replaces them", () => {
  for (const [file, label] of [
    ["src/app/dashboard/admin/items/page.tsx", "Add Item"],
    ["src/app/dashboard/admin/lockers/page.tsx", "Edit Lockers"],
    ["src/app/dashboard/admin/accounts/page.tsx", "Add Student"],
  ]) {
    const source = read(file);
    const start = source.indexOf("<span className=\"hidden lg:inline-flex\">");
    assert.ok(start >= 0, `${label} action is wrapped for phone hiding`);
    assert.ok(source.slice(start).includes(`${label}</VButton></span>`), `${label} sits inside the responsive wrapper`);
  }
});

test("admin Recent Inventory Items uses the phone horizontal slider", () => {
  const page = read("src/app/dashboard/admin/page.tsx");
  assert.match(page, /<h2 id="recent-inventory-title"/);
  assert.match(page, /role="region" aria-labelledby="recent-inventory-title" tabIndex=\{0\}/);
  assert.match(page, /grid-flow-col auto-cols-\[85%\] overflow-x-auto overscroll-x-contain snap-x snap-mandatory/);
  assert.match(page, /sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible sm:snap-none/);
  assert.match(page, /className="min-w-0 snap-start p-4 animate-pulse"/);
  assert.match(page, /className="min-w-0 snap-start p-4 lg:p-5 flex flex-col/);
  assert.match(page, /import \{ categoryIcon \} from "@\/lib\/category-icons"/);
  assert.match(page, /const CatIcon = categoryIcon\(item\.category\)/);
  assert.match(page, /<CatIcon size=\{32\}/, "the photo placeholder uses the category icon");
  assert.match(page, /<CatIcon size=\{12\} className="shrink-0" \/>/, "the category line shows its icon");
  assert.match(page, /<MapPin size=\{12\} className="shrink-0" \/>/);
  assert.match(page, /<Clock size=\{12\} className="shrink-0" \/>/);
  assert.match(page, /<DescriptionBox className="mt-3" contentClassName="line-clamp-3">/);
  assert.match(page, /<Eye size=\{13\} \/> View Details/);
  assert.match(page, /Swipe left or right to browse/);
  assert.match(page, /recentItems\.length > 1/);
  assert.doesNotMatch(page, /snap-y/);
});

test("admin floating buttons use the menu on home and the page action elsewhere", () => {
  const shell = read("src/components/student-shell.tsx");
  assert.match(shell, /adminPageQuickAction\(active\)/);
  assert.match(shell, /active === "Dashboard" \? \(/);
  assert.match(shell, /role="menu" aria-label="Admin quick actions"/);
  assert.match(shell, /<Menu size=\{24\} \/>/);
  assert.match(shell, /<adminPageAction\.icon size=\{24\} \/>/);
  assert.match(shell, /aria-label=\{adminPageAction\.label\}/);
  assert.match(shell, /onClick=\{\(\) => runQuickAction\(adminPageAction\)\}/);
});

test("admin suggested-match actions stay grouped and aligned on phones", () => {
  const claims = read("src/app/dashboard/admin/claims/page.tsx");
  assert.equal((claims.match(/flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto/g) ?? []).length, 2,
    "suggested matches and search results use one action group");
  assert.equal((claims.match(/min-w-\[4\.5rem\] flex-1 sm:flex-none/g) ?? []).length, 2,
    "View buttons share the phone row");
  assert.equal((claims.match(/min-w-\[8\.5rem\] flex-1 sm:flex-none/g) ?? []).length, 2,
    "Review & approve buttons share the phone row");
  assert.doesNotMatch(claims, /<VButton variant="secondary" size="sm" onClick=\{\(e\) => \{ e\.stopPropagation\(\); void openMatchPreview\(item\); \}\}>\s*View/,
    "View is not left as a separate wrapping flex child");
});

test("admin match details use the shared readable date format", () => {
  const claims = read("src/app/dashboard/admin/claims/page.tsx");
  assert.doesNotMatch(claims, /item\.foundDate \? String\(item\.foundDate\)\.slice\(0, 10\)/,
    "raw ISO dates are not shown in match rows");
  assert.equal((claims.match(/fmtDateValue\(item\.foundDate\)/g) ?? []).length, 2,
    "suggested and searched matches both format the found date");
  assert.match(claims, /date=\{fmtDateValue\(matchPreview\.item\.foundDate\)\}/,
    "the match detail dialog formats the found date");
});
