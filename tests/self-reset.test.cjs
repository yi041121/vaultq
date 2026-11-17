/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const server = require("next/server");

const root = path.join(__dirname, "..");

function load(file, deps = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    URL,
    URLSearchParams,
    process,
    Buffer,
    Date,
    Math,
    console: { info() {}, error() {} },
    fetch: (...args) => global.fetch(...args),
    ...globals,
    require(id) {
      assert.ok(id in deps, `Unexpected dependency: ${id}`);
      return deps[id];
    },
  });
  return exports;
}

const selfReset = load("src/lib/self-reset.ts", { "node:crypto": require("node:crypto") });
const sessionCookie = load("src/lib/session-cookie.ts");
const passwordReset = load("src/lib/password-reset.ts", { "node:crypto": require("node:crypto") });

function harness(options = {}) {
  const calls = {
    lookup: null,
    deletedTokens: 0,
    createdTokens: [],
    logs: { info: [], error: [] },
  };
  const account = options.account === undefined
    ? { id: "student-1", cardBarcode: "2000132602", role: "STUDENT", isActive: true }
    : options.account;

  const prisma = {
    user: {
      findFirst: async (query) => {
        calls.lookup = query;
        if (options.lookupFails) throw { transient: true };
        return account;
      },
    },
    passwordResetToken: {
      deleteMany: async () => {
        if (options.writeFails) throw { transient: true };
        calls.deletedTokens += 1;
      },
      create: async ({ data }) => {
        if (options.writeFails) throw { transient: true };
        calls.createdTokens.push(data);
      },
    },
    $transaction: async (operation) => operation(prisma),
  };

  const route = load("src/app/api/auth/self-reset/route.ts", {
    "next/server": server,
    "@/lib/prisma": { prisma },
    "@/lib/db-retry": {
      withDbRetry: (operation) => operation(),
      isTransientDbError: (error) => Boolean(error && error.transient),
    },
    "@/lib/session-cookie": sessionCookie,
    "@/lib/auth-rate-limit": {
      enforceAuthRateLimit: async () => {
        if (!options.limited) return null;
        return server.NextResponse.json({ success: false, error: "Too many attempts." }, { status: 429 });
      },
    },
    "@/lib/self-reset": selfReset,
    "@/lib/password-reset": passwordReset,
  }, {
    console: {
      info: (line) => calls.logs.info.push(String(line)),
      error: (...args) => calls.logs.error.push(args),
    },
  });

  return { POST: route.POST, calls };
}

const valid = { email: "Alice@Student.Tarc.Edu.My", barcode: "2000132602" };

function request(body = valid, headers = {}) {
  return new server.NextRequest("https://vaultq.example/api/auth/self-reset", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://vaultq.example", ...headers },
    body: JSON.stringify(body),
  });
}

async function expectRejected(response) {
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.error, /do not match/i);
}

test("matching email and barcode issue a one-time token in an HttpOnly cookie", async () => {
  const h = harness();
  const response = await h.POST(request());
  assert.equal(response.status, 200);

  const cookie = response.cookies.get("vq_reset");
  assert.ok(cookie, "the reset cookie is set");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, false, "tests run outside production");
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/");
  assert.equal(cookie.maxAge, 30 * 60);
  assert.match(cookie.value, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(response.cookies.get("vq_session"), undefined, "verification never creates a session");

  assert.equal(h.calls.lookup.where.email.equals, "alice@student.tarc.edu.my");
  assert.equal(h.calls.lookup.where.email.mode, "insensitive");
  assert.equal(h.calls.deletedTokens, 1);
  assert.equal(h.calls.createdTokens.length, 1);
  assert.equal(h.calls.createdTokens[0].userId, "student-1");
  assert.equal(h.calls.createdTokens[0].tokenHash, passwordReset.hashPasswordResetToken(cookie.value));
  assert.match(h.calls.createdTokens[0].tokenHash, /^[a-f0-9]{64}$/);
  const ttl = h.calls.createdTokens[0].expiresAt.getTime() - Date.now();
  assert.ok(ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000, "token expires after 30 minutes");

  // The audit line must not contain the email or barcode.
  assert.equal(h.calls.logs.info.length, 1);
  assert.match(h.calls.logs.info[0], /student-1/);
  assert.doesNotMatch(h.calls.logs.info[0], /alice|@|2000132602/i);
});

test("a wrong barcode, unknown, disabled or admin account is rejected identically", async () => {
  const attempts = [
    { account: { id: "student-1", cardBarcode: "9999999999", role: "STUDENT", isActive: true } },
    { account: null },
    { account: { id: "student-2", cardBarcode: "2000132602", role: "STUDENT", isActive: false } },
    { account: { id: "admin-1", cardBarcode: "2000132602", role: "ADMIN", isActive: true } },
    { account: { id: "student-3", cardBarcode: null, role: "STUDENT", isActive: true } },
  ];
  for (const options of attempts) {
    const h = harness(options);
    const response = await h.POST(request());
    await expectRejected(response);
    assert.equal(response.cookies.get("vq_reset"), undefined);
    assert.equal(h.calls.deletedTokens, 0);
    assert.equal(h.calls.createdTokens.length, 0);
  }
});

test("malformed input is rejected before any lookup", async () => {
  const cases = [
    { ...valid, email: "not-an-email" },
    { ...valid, email: "" },
    { ...valid, barcode: "12345" },
    { ...valid, barcode: "200013260a" },
    { ...valid, barcode: "" },
  ];
  for (const input of cases) {
    const h = harness();
    const response = await h.POST(request(input));
    assert.equal(response.status, 400);
    assert.equal(h.calls.lookup, null, "invalid input never reaches the database");
    assert.equal(h.calls.createdTokens.length, 0);
  }
});

test("cross-origin requests are refused before the lookup", async () => {
  const h = harness();
  const response = await h.POST(request(valid, { origin: "https://evil.example" }));
  assert.equal(response.status, 403);
  assert.equal(h.calls.lookup, null);
});

test("rate limiting stops the attempt before verification", async () => {
  const h = harness({ limited: true });
  const response = await h.POST(request());
  assert.equal(response.status, 429);
  assert.equal(h.calls.lookup, null);
  assert.equal(h.calls.createdTokens.length, 0);
});

test("transient database errors return a retryable service message", async () => {
  for (const options of [{ lookupFails: true }, { writeFails: true }]) {
    const h = harness(options);
    const response = await h.POST(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "30");
    assert.match((await response.json()).error, /temporarily unavailable/i);
    assert.equal(response.cookies.get("vq_reset"), undefined);
  }
});

test("barcode matching is exact, normalised and constant-time", () => {
  assert.equal(selfReset.accountBarcodeMatches({ cardBarcode: "2000132602" }, "2000132602"), true);
  assert.equal(selfReset.accountBarcodeMatches({ cardBarcode: "2000132602" }, " 2000132602 "), false,
    "the route trims before matching, so raw whitespace never matches");
  assert.equal(selfReset.accountBarcodeMatches({ cardBarcode: "2000132602" }, "2000132603"), false);
  assert.equal(selfReset.accountBarcodeMatches({ cardBarcode: null }, ""), false);
  assert.equal(selfReset.normalizeCardBarcode(" 2000132602 "), "2000132602");
  assert.equal(selfReset.secureEquals("same", "same"), true);
  assert.equal(selfReset.secureEquals("same", "different"), false);
  assert.equal(selfReset.SELF_RESET_BARCODE_PATTERN.test("2000132602"), true);
  assert.equal(selfReset.SELF_RESET_BARCODE_PATTERN.test("200013260"), false);
});
