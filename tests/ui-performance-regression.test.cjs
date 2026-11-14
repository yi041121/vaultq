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

test("pagination scrolls to the top and avoids the mobile tap/focus flash", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/components/ui/vault.tsx"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const element = (type, props) => ({ type, props });
  const calls = { pages: [], scrolls: [] };
  const window = {};
  const dependencies = {
    react: { useState: (value) => [value, () => {}], useEffect: () => {}, useRef: () => ({}) },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "lucide-react": { ChevronLeft: "ChevronLeft", ChevronRight: "ChevronRight", Search: "Search", X: "X" },
    "@/lib/design": {
      colors: { primary: "#123456", textMuted: "#456789", primarySoft: "#dbe4ee", border: "#ccd5df", textLight: "#8a97a6" },
      radius: {}, size: {}, font: {}, iconSize: {},
    },
    "@/lib/scroll-to-top": { scrollPageToTop: () => calls.scrolls.push("top") },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, window, require: (name) => dependencies[name] });

  const footer = exports.VPaginationFooter({
    current: 1, total: 2, pageSize: 8, itemCount: 10,
    onPage: (page) => calls.pages.push(page),
  });
  const pager = footer.props.children.find((child) => child?.type === exports.VPagination);
  assert.ok(pager, "footer renders the pagination control");
  pager.props.onPage(2);
  assert.deepEqual(calls.pages, [2]);
  assert.deepEqual(calls.scrolls, ["top"]);

  const footerOnPageTwo = exports.VPaginationFooter({
    current: 2, total: 2, pageSize: 8, itemCount: 10,
    onPage: (page) => calls.pages.push(page),
  });
  const pagerOnPageTwo = footerOnPageTwo.props.children.find((child) => child?.type === exports.VPagination);
  pagerOnPageTwo.props.onPage(2);
  assert.deepEqual(calls.pages, [2], "clicking the current page is a no-op");
  assert.equal(calls.scrolls.length, 1, "no extra scroll for the current page");

  const control = exports.VPagination({ current: 1, total: 2, onPage: () => {} });
  const pageButtons = control.props.children.flat(Infinity).filter((child) => child?.type === "button" && typeof child.props.children === "number");
  const active = pageButtons.find((child) => child.props.children === 1);
  assert.equal(active.props["aria-current"], "page");
  assert.equal(active.props.style.WebkitTapHighlightColor, "transparent");
  assert.doesNotMatch(active.props.className, /transition-all/);
});

function scrollToTopHarness({ reduceMotion = false, start = 400 } = {}) {
  const frames = [];
  const positions = [];
  const window = {
    scrollY: start,
    pageYOffset: start,
    matchMedia: () => ({ matches: reduceMotion }),
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
    cancelAnimationFrame: () => {},
    scrollTo: (_x, y) => positions.push(y),
  };
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/scroll-to-top.ts"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, window });
  return { exports, frames, positions };
}

test("phone pagination animates to the top without native smooth-scroll support", () => {
  const h = scrollToTopHarness();
  h.exports.scrollPageToTop({ duration: 100 });
  assert.equal(h.frames.length, 1);

  let time = 0;
  while (h.frames.length) {
    const callback = h.frames.shift();
    callback(time);
    time += 50;
    assert.ok(time < 1000, "animation terminates");
  }

  assert.equal(h.positions[0], 400);
  assert.ok(h.positions.length >= 3);
  assert.equal(h.positions[h.positions.length - 1], 0);
});

test("reduced motion jumps straight to the top", () => {
  const h = scrollToTopHarness({ reduceMotion: true });
  h.exports.scrollPageToTop();
  assert.deepEqual(h.positions, [0]);
  assert.equal(h.frames.length, 0);
});

test("mobile report form keeps its scrollbar inside the form card", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/dashboard/student/report/page.tsx"), "utf8");
  assert.match(source, /vq-form-scroll[^"]*max-h-\[calc\(92dvh-2rem\)\][^"]*overflow-y-auto/);
  assert.match(source, /max-h-\[92dvh\] overflow-visible lg:overflow-y-auto/);
});

test("report form uses an always-visible blue custom scroll indicator", () => {
  const report = fs.readFileSync(path.join(__dirname, "../src/app/dashboard/student/report/page.tsx"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../src/components/custom-scrollbar.tsx"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");
  assert.match(report, /<CustomScrollbar targetRef=\{formScrollRef\} \/>/);
  assert.match(component, /var\(--vq-primary\)/);
  assert.match(css, /\.vq-form-scroll::-webkit-scrollbar \{\s*display: none/);
});

test("phone quick-action FAB reuses the role actions without the theme toggle", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/components/student-shell.tsx"), "utf8");
  const start = source.indexOf("{/* Phone quick-action FAB");
  const end = source.indexOf("{/* Logout confirm dialog */}");
  assert.ok(start >= 0 && end > start, "FAB block exists");
  const fab = source.slice(start, end);
  assert.match(fab, /quickActions\.map/);
  assert.match(fab, /runQuickAction\(action\)/);
  assert.match(fab, /mobileFabOpen/);
  assert.doesNotMatch(fab, /ThemeToggle/);
  assert.match(source, /pointerdown/);
  assert.match(source, /mobileFabRef/);
  assert.match(source, /function runQuickAction\(action: QuickAction\)/);
  assert.match(source, /const quickActions = quickActionsForRole\(userRole\)/);
});

test("claim form offers a detailed no-photo verification path", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/dashboard/student/search/page.tsx"), "utf8");
  assert.match(source, /NO_PHOTO_REASON_MIN_LENGTH/);
  assert.match(source, /setClaimNoPhoto\(true\)/);
  assert.match(source, /form\.append\("noPhoto", "true"\)/);
  assert.match(source, /I don&apos;t have a photo of this item/);
});

test("skipping a matching lost report requires explicit confirmation", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/dashboard/student/search/page.tsx"), "utf8");
  assert.match(source, /linkSkipConfirmed/);
  assert.match(source, /I confirm this item is not from my pending lost report/);
  assert.match(source, /linkChoice === null && !linkSkipConfirmed/);
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
