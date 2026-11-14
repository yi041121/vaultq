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
  vm.runInNewContext(code, {
    exports,
    require(id) {
      assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
      return dependencies[id];
    },
    console,
  });
  return exports;
}

const validStudent = {
  name: "Alex Tan", email: "alex@student.tarc.edu.my", password: "test-password-only", cardBarcode: "2000132602",
};

function harness(options = {}) {
  const writes = [];
  let reads = 0;
  let hashes = 0;
  const prisma = { user: {
    findFirst: async () => { reads++; return options.duplicateEmail ? { id: "existing" } : null; },
    findUnique: async () => { reads++; return options.duplicateBarcode ? { id: "existing" } : null; },
    create: async ({ data }) => {
      if (options.createError) throw options.createError;
      writes.push(data);
      return { id: "new-account", name: data.name, email: data.email, role: data.role, cardBarcode: data.cardBarcode };
    },
  } };
  const dependencies = {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
    "@/lib/prisma": { prisma },
    "@/lib/auth": {
      hashPassword: async () => { hashes++; return "hashed-password"; },
      authenticateRequest: async () => options.user || null,
      generateToken: () => { throw new Error("Registration must not issue a session token"); },
    },
    "@/lib/db-retry": { withDbRetry: (fn) => fn() },
    "@/lib/person-name": load("src/lib/person-name.ts"),
    "@/lib/student-id": load("src/lib/student-id.ts"),
    // These suites exercise validation and authorization, not CSRF or rate
    // limiting; dedicated security tests cover both.
    "@/lib/session-cookie": { isSameOriginAuthRequest: () => true },
    "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => null },
  };
  return {
    register: load("src/app/api/auth/register/route.ts", dependencies),
    accounts: load("src/app/api/accounts/route.ts", dependencies),
    request: (body) => ({ json: async () => body }),
    writes, reads: () => reads, hashes: () => hashes,
  };
}

test("public signup rejects admin identity or privileged roles before any database work", async () => {
  for (const injected of [
    { adminId: "ADMIN-01" }, { adminId: "", role: "STUDENT" }, { adminId: null },
    { role: "ADMIN" }, { role: "admin" }, { role: ["ADMIN"] }, { role: { value: "ADMIN" } },
    { adminId: "ADMIN-01", email: "someone@example.test", cardBarcode: null },
  ]) {
    const h = harness();
    const result = await h.register.POST(h.request({ ...validStudent, ...injected }));
    assert.equal(result.status, 403, JSON.stringify(injected));
    assert.equal(h.reads(), 0);
    assert.equal(h.hashes(), 0);
    assert.equal(h.writes.length, 0);
    assert.equal(result.body.data, undefined);
  }
});

test("public signup always stores STUDENT, uses an explicit field allowlist, and issues no token", async () => {
  const h = harness();
  const result = await h.register.POST(h.request({
    ...validStudent, role: "STUDENT", name: "  Alex   Tan  ", email: " ALEX@STUDENT.TARC.EDU.MY ",
    cardBarcode: " 2000132602 ", isActive: false, id: "attacker-chosen-id", reviewedById: "admin",
  }));
  assert.equal(result.status, 201);
  assert.equal(h.writes.length, 1);
  assert.deepEqual(Object.keys(h.writes[0]).sort(), ["cardBarcode", "email", "name", "password", "role", "studentId"]);
  assert.equal(h.writes[0].role, "STUDENT");
  assert.equal(h.writes[0].email, "alex@student.tarc.edu.my");
  assert.equal(h.writes[0].name, "Alex Tan");
  assert.equal(h.writes[0].password, "hashed-password");
  assert.equal(h.writes[0].studentId, null);
  assert.equal(result.body.data.token, undefined);
  assert.equal(result.body.data.user.password, undefined);
});

test("public signup enforces student email and card requirements even for crafted requests", async () => {
  for (const invalid of [
    { email: "alex@example.test" }, { email: "alex@student.tarc.edu.my.attacker.test" },
    { cardBarcode: null }, { cardBarcode: "" }, { cardBarcode: "123" }, { cardBarcode: 2000132602 },
    { name: {} }, { email: {} }, { password: {} }, { studentId: {} }, { studentId: "not-an-id" },
  ]) {
    const h = harness();
    assert.equal((await h.register.POST(h.request({ ...validStudent, ...invalid }))).status, 400);
    assert.equal(h.writes.length, 0);
  }
});

test("optional student IDs are normalized using the existing shared rules", async () => {
  const h = harness();
  assert.equal((await h.register.POST(h.request({ ...validStudent, studentId: " 25smr10180 " }))).status, 201);
  assert.equal(h.writes[0].studentId, "25SMR10180");
});

test("malformed JSON and non-object signup bodies return 400 rather than server errors", async () => {
  const h = harness();
  for (const body of [null, [], "text", 123, false]) {
    assert.equal((await h.register.POST(h.request(body))).status, 400);
  }
  assert.equal((await h.register.POST({ json: async () => { throw new SyntaxError("Invalid JSON"); } })).status, 400);
  assert.equal(h.reads(), 0);
});

test("duplicate signup checks and concurrent unique-constraint failures return 409", async () => {
  for (const options of [
    { duplicateEmail: true }, { duplicateBarcode: true }, { createError: { code: "P2002" } },
  ]) {
    const h = harness(options);
    assert.equal((await h.register.POST(h.request(validStudent))).status, 409);
    assert.equal(h.writes.length, 0);
  }
});

test("admin account creation rejects anonymous users and students before parsing input", async () => {
  for (const [user, expected] of [[null, 401], [{ id: "student", role: "STUDENT" }, 403]]) {
    const h = harness({ user });
    const result = await h.accounts.POST({ json: async () => { throw new Error("Unauthorized request body must not be read"); } });
    assert.equal(result.status, expected);
    assert.equal(h.reads(), 0);
    assert.equal(h.writes.length, 0);
  }
});

test("an authenticated admin can still create admin and student accounts through /api/accounts", async () => {
  for (const target of [
    { name: "Staff User", email: "staff@example.test", password: "test-password-only", role: "ADMIN", adminId: "ADMIN-02" },
    { ...validStudent, role: "STUDENT" },
  ]) {
    const h = harness({ user: { id: "existing-admin", role: "ADMIN" } });
    const result = await h.accounts.POST(h.request(target));
    assert.equal(result.status, 201);
    assert.equal(h.writes[0].role, target.role);
    assert.equal(h.writes[0].adminId, target.role === "ADMIN" ? "ADMIN-02" : null);
  }
});
