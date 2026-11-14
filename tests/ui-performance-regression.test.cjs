/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

test("shared dates use day short-month year and preserve date-only values", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/date-format.ts"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Date });
  const { formatDisplayDate, formatDisplayTimestamp } = exports;
  assert.equal(formatDisplayDate("2026-11-13"), "13 Nov 2026");
  assert.equal(formatDisplayDate("2026-01-03"), "3 Jan 2026");
  assert.equal(formatDisplayDate("2024-02-29"), "29 Feb 2024");
  assert.equal(formatDisplayDate(new Date(2026, 10, 13, 12)), "13 Nov 2026");
  for (const value of [undefined, null, "", "invalid", new Date(NaN)]) {
    assert.equal(formatDisplayDate(value), "—");
  }
  assert.equal(formatDisplayTimestamp("2026-11-13T13:05:00"), "13 Nov 2026 · 1:05 pm");
  assert.equal(formatDisplayTimestamp("invalid"), "—");
});

function illustrationHarness() {
  const source = fs.readFileSync(path.join(__dirname, "../src/components/locker-illustration.tsx"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const intervals = new Set();
  let cleanup;
  let memoized = false;
  const element = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      memo: (component) => { memoized = true; return component; },
      useState: () => [0, () => {}],
      useEffect: (effect) => { cleanup?.(); cleanup = effect(); },
    },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "lucide-react": { Cloud: "cloud" },
    "@/lib/design": { colors: { bg: "white", fill: "grey" } },
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require: (name) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    setInterval: (callback) => { intervals.add(callback); return callback; },
    clearInterval: (callback) => intervals.delete(callback),
  });
  return { render: exports.default, intervals, get memoized() { return memoized; } };
}

test("auth background is memoized so field updates do not redraw the locker tree", () => {
  assert.equal(illustrationHarness().memoized, true);
});

test("static login/signup backgrounds never start a redraw timer", () => {
  const harness = illustrationHarness();
  const tree = harness.render({ animated: false, hideIdCard: true });
  assert.equal(harness.intervals.size, 0);
  assert.match(tree.props.className, /locker-static/);
});

test("finishing the intro stops its timer before the user types", () => {
  const harness = illustrationHarness();
  harness.render({ animated: true });
  assert.equal(harness.intervals.size, 1);
  harness.render({ animated: false });
  assert.equal(harness.intervals.size, 0);
});

test("dropdown option hover does not use React state or event-driven redraws", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/components/ui/vault.tsx"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const element = (type, props) => ({ type, props });
  const dependencies = {
    react: { useState: () => assert.fail("Dropdown hover must not schedule a React update") },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "lucide-react": {},
    "@/lib/design": { colors: { primary: "blue", textMuted: "grey", primarySoft: "lightblue" } },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => dependencies[name] });
  const item = exports.VDropdownItem({ children: "Electronics", active: true });
  assert.match(item.props.className, /vq-dropdown-item/);
  assert.equal(item.props.onMouseEnter, undefined);
  assert.equal(item.props.onMouseLeave, undefined);
  assert.doesNotMatch(item.props.className, /transition/);
  assert.equal(item.props.style.backgroundColor, "lightblue");
});

function quickActionHarness(href) {
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/use-page-quick-action.ts"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const listeners = new Map();
  const cleanups = [];
  const historyState = { nextRouter: true };
  const window = {
    location: new URL(href),
    history: {
      state: historyState,
      replaceState: (state, _title, path) => {
        assert.equal(state, historyState);
        window.location = new URL(path, window.location.origin);
      },
    },
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name),
  };
  const dependencies = {
    react: { useRef: (value) => ({ current: value }), useEffect: (effect) => { cleanups.push(effect()); } },
    "@/lib/quick-actions": { QUICK_ACTION_EVENT: "vaultq:quick-action" },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, window, URL, require: (name) => dependencies[name] });
  let opened = 0;
  return {
    window,
    start: (parameter) => exports.usePageQuickAction(parameter, () => { opened++; }),
    trigger: (path) => listeners.get("vaultq:quick-action")?.({ detail: path }),
    stop: () => cleanups.forEach((cleanup) => cleanup?.()),
    listeners,
    get opened() { return opened; },
  };
}

test("quick action navigation opens the form once without discarding other URL state", () => {
  const h = quickActionHarness("https://vaultq.test/dashboard/admin/accounts?add=1&q=Alex#students");
  h.start("add");
  assert.equal(h.opened, 1);
  assert.equal(h.window.location.search, "?q=Alex");
  assert.equal(h.window.location.hash, "#students");
  h.stop();
  assert.equal(h.listeners.size, 0);
});

test("quick action can reopen a form on the current page and ignores other pages", () => {
  const h = quickActionHarness("https://vaultq.test/dashboard/admin/lockers");
  h.start("edit");
  assert.equal(h.opened, 0);
  h.trigger("/dashboard/admin/lockers?edit=1");
  h.trigger("/dashboard/admin/lockers?edit=1");
  assert.equal(h.opened, 2);
  h.trigger("/dashboard/admin/accounts?add=1");
  h.trigger("https://other.test/dashboard/admin/lockers?edit=1");
  assert.equal(h.opened, 2);
  h.stop();
});

test("item and evidence photo previews never crop the photo edges away", () => {
  const files = [
    "src/components/item-details-modal.tsx",
    "src/components/evidence-slider.tsx",
    "src/components/photo-viewer-modal.tsx",
    "src/app/dashboard/student/page.tsx",
    "src/app/dashboard/student/claims/page.tsx",
    "src/app/dashboard/student/report/page.tsx",
    "src/app/dashboard/student/search/page.tsx",
    "src/app/dashboard/admin/page.tsx",
    "src/app/dashboard/admin/claims/page.tsx",
    "src/app/dashboard/admin/items/page.tsx",
    "src/app/dashboard/admin/lockers/page.tsx",
    // Intake keeps full-bleed cropped previews by design.
  ];
  let checked = 0;
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === "img") {
        checked++;
        const attributes = node.attributes.getText(source);
        const dashboardPreview = file === "src/app/dashboard/student/page.tsx"
          || file === "src/app/dashboard/admin/page.tsx";
        if (dashboardPreview) {
          assert.match(attributes, /object-cover/, `${file}: dashboard previews fill their frames`);
          return;
        }
        // Verification card previews intentionally fill matching frames;
        // details, evidence viewers and other previews retain the full image.
        const comparisonPreview = file === "src/app/dashboard/admin/claims/page.tsx"
          && /alt=(?:\{`(?:Found item photo|Student evidence photo)|"Report photo")/.test(attributes);
        if (comparisonPreview) {
          assert.match(attributes, /absolute inset-0 w-full h-full object-cover/);
          return;
        }
        assert.doesNotMatch(attributes, /object-cover/, `${file}: photos must not crop the edges away`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.ok(checked >= 24, "check card photos, evidence, details and viewer thumbnails");
});

test("claim verification uses eight cards per page and equal comparison columns", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src/app/dashboard/admin/claims/page.tsx"), "utf8");
  assert.match(source, /const pageSize = 8;/);
  assert.match(source, /grid grid-cols-2 gap-2 aspect-\[4\/3\]/);
  assert.match(source, /sortedRows\.slice\(\(currentPage - 1\) \* pageSize, currentPage \* pageSize\)/);
  assert.equal((source.match(/className="absolute inset-0 w-full h-full block group cursor-pointer"/g) || []).length, 2);
});

test("student latest items exclude their own verified hand-ins before taking four", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src/app/dashboard/student/page.tsx"), "utf8");
  const expression = source.match(/const latestItems = (.*);/)[1];
  const selectLatest = new Function("items", `return ${expression};`);
  const items = [
    { id: "own", reportedByMe: true },
    ...Array.from({ length: 5 }, (_, i) => ({ id: `other-${i}`, reportedByMe: false })),
  ];
  assert.deepEqual(selectLatest(items).map((item) => item.id), ["other-0", "other-1", "other-2", "other-3"]);
  assert.deepEqual(selectLatest([{ id: "own", reportedByMe: true }]), []);
  assert.deepEqual(selectLatest([]), []);
});
