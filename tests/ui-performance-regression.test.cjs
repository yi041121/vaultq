/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

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
