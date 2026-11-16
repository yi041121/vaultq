/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const server = require("next/server");

function load(file, deps, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Buffer, console, ...globals, require(id) {
    assert.ok(id in deps, `Unexpected dependency: ${id}`); return deps[id];
  } });
  return exports;
}

function worker(secret = "s".repeat(40), unavailable = false) {
  let calls = 0;
  const route = load("src/app/api/internal/notifications/drain/route.ts", {
    "node:crypto": require("node:crypto"), "next/server": server,
    "@/lib/notification-outbox": { drainNotificationOutbox: async () => { calls++; if (unavailable) throw new Error("private error"); return { completed: 1 }; } },
  }, { process: { env: { CRON_SECRET: secret } } });
  return { calls: () => calls, run: authorization => route.GET(new server.NextRequest("https://test/api/internal/notifications/drain", {
    headers: authorization ? { authorization } : {},
  })) };
}

test("notification scheduler fails closed without a strong configured secret", async () => {
  for (const secret of [undefined, "short"]) {
    const h = worker(secret === undefined ? "" : secret);
    assert.equal((await h.run()).status, 503);
    assert.equal(h.calls(), 0);
  }
});

test("notification scheduler rejects anonymous/wrong credentials and accepts only the Bearer secret", async () => {
  const h = worker();
  for (const header of [undefined, "Bearer wrong", "s".repeat(40)]) assert.equal((await h.run(header)).status, 401);
  assert.equal(h.calls(), 0);
  const response = await h.run(`Bearer ${"s".repeat(40)}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(h.calls(), 1);
});

test("scheduler reports database unavailability without leaking errors", async () => {
  const h = worker("s".repeat(40), true);
  const response = await h.run(`Bearer ${"s".repeat(40)}`);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private error/);
});

test("notification-job inspection/replay is admin-only and cannot replay completed jobs", async () => {
  for (const actor of [null, { id: "student", role: "STUDENT" }, { id: "admin", role: "ADMIN" }]) {
    const writes = [];
    const route = load("src/app/api/admin/notification-jobs/route.ts", {
      "next/server": server, "@/lib/auth": { authenticateRequest: async () => actor },
      "@/lib/prisma": { prisma: { $executeRaw: async (strings, id) => { writes.push({ sql: strings.join("?"), id }); return 1; } } },
    });
    const request = { json: async () => ({ id: "failed-job" }) };
    const response = await route.POST(request);
    assert.equal(response.status, !actor ? 401 : actor.role === "STUDENT" ? 403 : 200);
    if (actor?.role === "ADMIN") {
      assert.match(writes[0].sql, /failed_at IS NOT NULL AND completed_at IS NULL/);
      assert.equal(writes[0].id, "failed-job");
      assert.equal((await route.POST({ json: async () => ({ id: {} }) })).status, 400);
    } else {
      assert.equal((await route.GET({})).status, !actor ? 401 : 403);
      assert.equal(writes.length, 0);
    }
  }
});
