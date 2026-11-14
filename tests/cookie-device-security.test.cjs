/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const jwt = require("jsonwebtoken");
const ROOT = path.join(__dirname, "..");

function load(file, deps = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Buffer, console, ...globals, require(name) {
    assert.ok(name in deps, `Unexpected dependency ${name}`);
    return deps[name];
  } });
  return exports;
}
const secret = "server-only-hardware-session-secret-for-tests-123456";
const devices = [
  { deviceId: "device-1", lockerNumber: "B03", apiKey: "a".repeat(48) },
  { deviceId: "device-2", lockerNumber: "A01", apiKey: "b".repeat(48) },
];
function hardwareHarness(registry = devices, extraEnv = {}) {
  const env = { HARDWARE_SESSION_SECRET: secret, HARDWARE_DEVICES: JSON.stringify(registry), ...extraEnv };
  const mod = load("src/lib/hardware-auth.ts", {
    crypto: require("node:crypto"), jsonwebtoken: { __esModule: true, default: jwt },
  }, { process: { env } });
  return { mod, env };
}

test("hardware has unique device credentials and server-owned locker mappings", () => {
  const { mod } = hardwareHarness();
  assert.equal(mod.isHardwareConfigured(), true);
  const device = mod.authenticateHardwareDevice("device-1", devices[0].apiKey);
  assert.equal(device.lockerNumber, "B03");
  assert.equal(device.apiKey, undefined, "authenticated device metadata contains no credential");
  assert.equal(mod.authenticateHardwareDevice("device-2", devices[0].apiKey), null);
  assert.equal(mod.authenticateHardwareDevice("device-1", devices[1].apiKey), null);
  assert.equal(mod.authenticateHardwareDevice("unknown", devices[0].apiKey), null);
  assert.equal(mod.authenticateHardwareDevice("device-1", null), null);
  assert.throws(() => mod.createLockerSession("student", { deviceId: "device-1", lockerNumber: "A01" }), /not registered/);
});

test("malformed or ambiguous hardware configuration fails closed without global-key fallback", () => {
  for (const registry of [null, {}, [], [devices[0], devices[0]], [devices[0], { ...devices[1], apiKey: devices[0].apiKey }], [devices[0], { ...devices[1], lockerNumber: "B03" }], [{ ...devices[0], apiKey: "short" }], [{ ...devices[0], apiKey: " ".repeat(40) }], [{ ...devices[0], deviceId: "../invalid" }]]) {
    const { mod } = hardwareHarness(registry, { HARDWARE_API_KEY: devices[0].apiKey, LOCKER_NUMBER: "B03" });
    assert.equal(mod.isHardwareConfigured(), false);
    assert.equal(mod.authenticateHardwareDevice("device-1", devices[0].apiKey), null);
  }
  assert.equal(hardwareHarness(devices, { HARDWARE_DEVICES: "not-json" }).mod.isHardwareConfigured(), false);
  assert.equal(hardwareHarness(devices, { HARDWARE_SESSION_SECRET: "short" }).mod.isHardwareConfigured(), false);
});

test("locker sessions are bound to enrolled devices and expire/reject wrong algorithms", () => {
  const { mod, env } = hardwareHarness();
  const device = mod.authenticateHardwareDevice("device-2", devices[1].apiKey);
  const token = mod.createLockerSession("student-1", device);
  const payload = mod.readLockerSession(token);
  assert.equal(payload.deviceId, "device-2");
  assert.equal(payload.locker, "A01");
  const claims = { purpose: "locker", userId: "student-1", deviceId: "device-2", locker: "A01" };
  const options = { issuer: "vaultq-hardware", audience: "vaultq-locker", expiresIn: 120 };
  for (const invalid of [
    jwt.sign(claims, secret, { ...options, expiresIn: -1 }),
    jwt.sign(claims, secret, { ...options, algorithm: "HS512" }),
    jwt.sign(claims, secret, { ...options, audience: "wrong" }),
    jwt.sign({ ...claims, purpose: "other" }, secret, options),
    jwt.sign({ ...claims, locker: "B03" }, secret, options),
    jwt.sign(claims, secret, { issuer: options.issuer, audience: options.audience }),
  ]) assert.equal(mod.readLockerSession(invalid), null);
  env.HARDWARE_DEVICES = JSON.stringify([devices[0]]);
  assert.equal(mod.readLockerSession(token), null, "removing a device revokes its sessions");
  env.HARDWARE_DEVICES = JSON.stringify([devices[0], { ...devices[1], lockerNumber: "A02" }]);
  assert.equal(mod.readLockerSession(token), null, "changing a device's locker invalidates old bindings");
});

test("legacy browser credentials are purged and only non-authenticating metadata is stored", () => {
  const values = new Map([["token", "legacy.signed.jwt"]]);
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const store = load("src/lib/browser-session-store.ts", {}, { localStorage });
  assert.equal(store.getBrowserSessionKey(), null);
  assert.equal(values.has("token"), false);
  store.storeBrowserSession({ sessionKey: "public-cache-id", expiresAt: Date.now() + 60_000, user: { id: "student", role: "STUDENT" } });
  assert.equal(store.getBrowserSessionKey(), "public-cache-id");
  assert.equal(store.isBrowserSessionExpired(), false);
  assert.equal(values.has("token"), false);
  store.clearStoredBrowserSession();
  assert.equal(store.getBrowserSessionKey(), null);
  assert.equal(store.isBrowserSessionExpired(), true);
});

test("browser code never persists JWTs or sends bearer authentication", () => {
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "generated" || entry.name === "api") continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.tsx?$/.test(file)) {
        const source = fs.readFileSync(file, "utf8");
        assert.doesNotMatch(source, /localStorage\.(?:setItem|getItem)\(["']token["']/, file);
        assert.doesNotMatch(source, /Authorization:\s*`Bearer/, file);
      }
    }
  }
  inspect(path.join(ROOT, "src"));
});

test("identify rejects a mismatched device/key before looking up the student", async () => {
  const { mod } = hardwareHarness();
  let reads = 0;
  const route = load("src/app/api/hardware/identify/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    "@/lib/hardware-auth": mod,
    "@/lib/prisma": { prisma: { user: { findFirst: async () => { reads++; return { id: "student", name: "Student" }; } } } },
  });
  const result = await route.POST({ headers: { get: () => devices[0].apiKey }, json: async () => ({ deviceId: "device-2", cardBarcode: "2000132602" }) });
  assert.equal(result.status, 401);
  assert.equal(reads, 0);
  const valid = await route.POST({ headers: { get: () => devices[1].apiKey }, json: async () => ({ deviceId: "device-2", cardBarcode: "2000132602" }) });
  assert.equal(valid.status, 200);
  assert.equal(mod.readLockerSession(valid.body.data.sessionToken).locker, "A01");
  assert.ok(!JSON.stringify(valid.body).includes(devices[1].apiKey));
});

test("verify takes its target locker only from the authenticated device registry", async () => {
  const { mod } = hardwareHarness();
  let calls = 0;
  let observed;
  const route = load("src/app/api/hardware/verify/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    "@/lib/hardware-auth": mod,
    "@/lib/pickup-service": {
      PickupError: class extends Error {},
      collectPickup: async input => { calls++; observed = input; return { locker: input.expectedLockerNumber }; },
    },
  }, { process: { env: { NODE_ENV: "production" } } });
  const device = mod.authenticateHardwareDevice("device-2", devices[1].apiKey);
  const sessionToken = mod.createLockerSession("student", device);
  const body = { deviceId: "device-2", sessionToken, token: "pickup-token", lockerNumber: "B03", dryRun: true };
  const request = (key, input = body) => ({ headers: { get: () => key }, json: async () => input });
  assert.equal((await route.POST(request(devices[1].apiKey))).status, 200);
  assert.equal(observed.expectedLockerNumber, "A01");
  assert.equal(observed.expectedUserId, "student");
  assert.equal(observed.dryRun, false);
  assert.equal((await route.POST(request(devices[0].apiKey))).status, 401);
  assert.equal((await route.POST(request(devices[0].apiKey, { ...body, deviceId: "device-1" }))).status, 401);
  assert.equal(calls, 1, "cross-device requests never reach pickup writes");
});

test("report sessionStorage cannot restore another account's cached reports", () => {
  const values = new Map([["vq_session_key", "new-account"]]);
  const localStorage = { getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key) };
  const reports = new Map([["vaultq:reports-cache", JSON.stringify({ at: Date.now(), owner: "old-account", reports: [{ id: "private-old-report" }] })]]);
  const sessionStorage = { getItem: key => reports.get(key) ?? null, removeItem: key => reports.delete(key) };
  const store = load("src/lib/browser-session-store.ts", {}, { localStorage });
  const cache = load("src/lib/student-cache.ts", {
    "./browser-session-store": store, "./report-pages": {}, "@/lib/claim-mapper": {}, "@/lib/item-mapper": {},
    "@/lib/report-mapper": {}, "@/lib/admin-data": { clearAdminData: () => {} },
  }, { localStorage, window: { sessionStorage } });
  assert.equal(cache.getCachedReports(), null);
  assert.equal(reports.has("vaultq:reports-cache"), false);
});
