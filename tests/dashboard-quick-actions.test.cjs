/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");

function load(file, dependencies) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { exports, require(id) { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; } });
  return exports;
}
const actions = load("src/lib/quick-actions.ts", { "lucide-react": new Proxy({}, { get: (_, key) => key }) });
const element = (type, props) => ({ type, props });
const { DashboardQuickActions } = load("src/components/student/dashboard-quick-actions.tsx", {
  "@/lib/quick-actions": actions,
  "@/components/ui/vault": { vcolors: { primary: "blue", primarySoft: "soft-blue", border: "grey", text: "black" }, font: { sectionTitle: "section-title" } },
  "react/jsx-runtime": { jsx: element, jsxs: element },
});

test("dashboard shortcuts render under a Quick actions heading as accessible buttons", () => {
  const section = DashboardQuickActions({ onNavigate() {} });
  assert.equal(section.type, "section");
  const [heading, nav] = section.props.children;
  assert.equal(heading.type, "h2");
  assert.equal(heading.props.id, "dashboard-quick-actions-title");
  assert.equal(heading.props.children, "Quick actions");
  assert.equal(nav.type, "nav");
  assert.equal(nav.props["aria-labelledby"], "dashboard-quick-actions-title");
  const grid = nav.props.children;
  assert.match(grid.props.className, /grid-cols-4/);
  assert.equal(grid.props.children.length, 4);
  for (const [index, button] of grid.props.children.entries()) {
    assert.equal(button.type, "button");
    assert.equal(button.props.type, "button");
    assert.equal(button.props["aria-label"], actions.studentQuickActions[index].label);
    assert.match(button.props.className, /min-w-0/);
  }
});

test("every dashboard shortcut navigates to the existing shared action URL", () => {
  const visited = [];
  const section = DashboardQuickActions({ onNavigate: url => visited.push(url) });
  const nav = section.props.children[1];
  for (const button of nav.props.children.props.children) button.props.onClick();
  assert.deepEqual(visited, Array.from(actions.studentQuickActions, action => action.path));
  assert.equal(visited[0], "/dashboard/student/report?tab=new&type=lost");
  assert.equal(visited[1], "/dashboard/student/report?tab=new&type=found");
  assert.equal(visited[2], "/dashboard/student/claims");
  assert.equal(visited[3], "/dashboard/student/report?tab=reports");
});

test("the icon row replaces dashboard statistics on both layouts without advertising absent features", () => {
  const page = fs.readFileSync(path.join(root, "src/app/dashboard/student/page.tsx"), "utf8");
  assert.match(page, /<DashboardQuickActions onNavigate=\{\(path\) => router.push\(path\)\}/);
  assert.doesNotMatch(page, /Total Found Items|Active Claims|Returned This Week|const stats|weekAgo/);
  const component = fs.readFileSync(path.join(root, "src/components/student/dashboard-quick-actions.tsx"), "utf8");
  assert.doesNotMatch(component, /QR Tags|AI Match|Rewards|sm:hidden|lg:hidden/);
  assert.match(component, /studentQuickActions\.map/);
  assert.match(component, />Quick actions</, "the row is labelled above the shortcuts");
});
