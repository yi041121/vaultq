/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.join(__dirname, "..");
function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const policy = load("src/lib/claim-validation.ts");
const flows = load("src/lib/assistant-flow.ts", { "./claim-validation": policy });

test("assistant only provides menus for known student/admin roles", () => {
  for (const role of ["", "admin", "GUEST", undefined, null]) {
    assert.equal(flows.assistantFlowForRole(role), null);
  }
  assert.notEqual(flows.assistantFlowForRole("STUDENT"), flows.assistantFlowForRole("ADMIN"));
});

test("every assistant choice is reachable, finite, and links to an existing role-specific page", () => {
  for (const role of ["STUDENT", "ADMIN"]) {
    const flow = flows.assistantFlowForRole(role);
    const visited = new Set();
    function visit(id, ancestors = []) {
      assert.ok(flow[id], `Missing topic: ${id}`);
      assert.ok(!ancestors.includes(id), `Conversation cycle: ${id}`);
      visited.add(id);
      const node = flow[id];
      assert.ok(node.message.trim().length > 0);
      if (node.action) {
        assert.ok(node.action.path.startsWith(`/dashboard/${role.toLowerCase()}/`));
        const pathname = node.action.path.split("?")[0];
        assert.ok(fs.existsSync(path.join(root, "src/app", pathname, "page.tsx")), pathname);
      }
      for (const option of node.options ?? []) {
        assert.ok(option.label.trim());
        visit(option.next, [...ancestors, id]);
      }
    }
    visit("home");
    assert.equal(visited.size, Object.keys(flow).length, "No unreachable topics");
  }
});

test("guidance preserves the no-photo policy, admin decisions and honest status scope", () => {
  const student = flows.assistantFlowForRole("STUDENT");
  const admin = flows.assistantFlowForRole("ADMIN");
  assert.ok(student.noPhoto.message.includes(String(policy.NO_PHOTO_REASON_MIN_LENGTH)));
  assert.match(student.noPhoto.message, /in person/);
  assert.match(student.link.message, /not automatically closed/);
  assert.match(admin.matches.message, /not automatically closed/);
  assert.match(admin.noPhoto.message, /alone is not proof/);
  assert.match(student.status.message, /does not display live status/);
  assert.match(student.collect.message, /cannot unlock lockers/);
});

function assistantHarness(role = "STUDENT") {
  let state = [];
  let closed = 0;
  const jsx = (type, props) => typeof type === "function" ? type(props) : ({ type, props });
  const icons = Object.fromEntries(["ArrowLeft", "ArrowUpRight", "MessageCircle", "RotateCcw", "X"].map((name) => [name, name]));
  const { GuidedAssistant } = load("src/components/guided-assistant.tsx", {
    react: {
      useState: () => [state, (update) => { state = typeof update === "function" ? update(state) : update; }],
      useRef: () => ({ current: null }),
      useEffect: () => {},
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "link" },
    "lucide-react": icons,
    "@/lib/design": { colors: {} },
    "@/lib/assistant-flow": flows,
  });
  function elements(node, result = []) {
    if (!node || typeof node !== "object") return result;
    if (Array.isArray(node)) { node.forEach((child) => elements(child, result)); return result; }
    result.push(node);
    elements(node.props?.children, result);
    return result;
  }
  const render = () => elements(GuidedAssistant({ role, onClose: () => { closed++; } }));
  return { render, get closed() { return closed; } };
}

test("button-only conversation supports follow-up choices, back and main menu", () => {
  const h = assistantHarness();
  const choose = (label) => {
    const button = h.render().find((node) => node.type === "button" && node.props.children === label);
    assert.ok(button, `Missing button ${label}`);
    button.props.onClick();
  };
  choose("Help me claim an item");
  choose("I don’t have a photo");
  assert.ok(h.render().some((node) => node.type === "p" && typeof node.props.children === "string" && node.props.children.includes("at least 80 characters")));
  h.render().find((node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("Back")).props.onClick();
  assert.ok(h.render().some((node) => node.props?.children === "I don’t have a photo"));
  h.render().find((node) => node.type === "button" && Array.isArray(node.props.children) && node.props.children.includes("Main menu")).props.onClick();
  assert.ok(h.render().some((node) => node.props?.children === "I lost something"));
  assert.ok(!h.render().some((node) => ["input", "textarea", "form"].includes(node.type) || node.props?.contentEditable));
});

test("assistant closes on Escape, outside click, close button and navigation", () => {
  const h = assistantHarness("ADMIN");
  let prevented = false;
  const dialog = h.render()[0];
  dialog.props.onCancel({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  dialog.props.onClick({ target: 1, currentTarget: 2 });
  assert.equal(h.closed, 1, "Inside clicks must not dismiss");
  dialog.props.onClick({ target: 1, currentTarget: 1 });
  h.render().find((node) => node.props?.["aria-label"] === "Close assistant").props.onClick();
  h.render().find((node) => node.props?.children === "Review claims").props.onClick();
  h.render().find((node) => node.type === "link").props.onClick();
  assert.equal(h.closed, 4);
  assert.equal(assistantHarness("GUEST").render().length, 0);
});
