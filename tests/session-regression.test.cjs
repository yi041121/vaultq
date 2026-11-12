/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Load the existing TypeScript modules with isolated browser/React doubles.
function load(file, dependencies, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Date, JSON, Number, Promise, Set, AbortController, AbortSignal, Event,
    atob, URLSearchParams, console, ...globals,
    require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function sessionHarness() {
  const localStorage = storage();
  const sessionStorage = storage();
  const listeners = {};
  const timers = new Map();
  let nextTimer = 0;
  let cleanup;
  let cacheClears = 0;
  const redirects = [];
  const window = {
    sessionStorage,
    addEventListener: (name, callback) => { listeners[name] = callback; },
    removeEventListener: (name) => { delete listeners[name]; },
    setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  };
  const document = {
    cookie: "", visibilityState: "visible",
    addEventListener: (name, callback) => { listeners[name] = callback; },
    removeEventListener: (name) => { delete listeners[name]; },
  };
  const globals = { window, document, localStorage };
  const idle = load("src/lib/idle-session.ts", {
    "@/lib/student-cache": { clearStudentCache: () => { cacheClears++; } },
  }, globals);
  const hook = load("src/lib/use-idle-session.ts", {
    react: { useEffect: (effect) => { cleanup = effect(); } },
    "@/lib/idle-session": idle,
  }, globals);
  const token = (exp) => `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
  return {
    localStorage, listeners, timers, idle, token, document,
    redirects, get cacheClears() { return cacheClears; },
    start: () => hook.useIdleSession({ replace: (url) => redirects.push(url) }),
    stop: () => cleanup?.(),
  };
}

test("expired JWT clears session, role cookie and account caches", () => {
  const h = sessionHarness();
  h.localStorage.setItem("token", h.token(Date.now() / 1000 - 60));
  h.start();
  assert.equal(h.localStorage.getItem("token"), null);
  assert.equal(h.cacheClears, 1);
  assert.match(h.document.cookie, /max-age=0/);
  assert.deepEqual(h.redirects, ["/login?skip=1&expired=1"]);
});

test("an active dashboard rechecks JWT expiry instead of waiting for idle logout", () => {
  const h = sessionHarness();
  h.localStorage.setItem("token", h.token(Date.now() / 1000 + 3600));
  h.start();
  h.localStorage.setItem("token", h.token(Date.now() / 1000 - 1));
  [...h.timers.values()][0]();
  assert.equal(h.redirects.length, 1);
  h.listeners.pointerdown();
  assert.equal(h.localStorage.getItem("vq_last_activity"), null);
  assert.equal(h.redirects.length, 1);
  h.stop();
});

test("returning after idle timeout cannot revive the expired session", () => {
  const h = sessionHarness();
  h.localStorage.setItem("token", h.token(Date.now() / 1000 + 3600));
  h.start();
  h.localStorage.setItem("vq_last_activity", Date.now() - h.idle.IDLE_TIMEOUT_MS - 1);
  h.listeners.pointerdown();
  assert.equal(h.localStorage.getItem("token"), null);
  assert.equal(h.redirects.length, 1);
  h.stop();
});

test("a stale cross-tab token removal event does not log out a newly signed-in account", () => {
  const h = sessionHarness();
  h.localStorage.setItem("token", h.token(Date.now() / 1000 + 3600));
  h.start();
  h.listeners.storage({ key: "token", newValue: null });
  assert.equal(h.redirects.length, 0);
  h.stop();
});

test("clearing account caches aborts prefetch and prevents late responses repopulating them", async () => {
  const pending = [];
  const localStorage = storage();
  localStorage.setItem("token", "old-session");
  const sessionStorage = storage();
  const cache = load("src/lib/student-cache.ts", {
    "@/lib/admin-data": { clearAdminData: () => {} },
    "@/lib/claim-mapper": { mapUserClaim: (value) => value },
    "@/lib/item-mapper": { mapApiItem: (value) => value },
    "@/lib/report-mapper": { mapReport: (value) => value },
  }, {
    localStorage,
    window: { sessionStorage, dispatchEvent: () => {} },
    fetch: (_url, options) => new Promise((resolve) => pending.push({ resolve, options })),
  });
  const prefetch = cache.prefetchStudentData("old-session");
  cache.clearStudentCache();
  for (const { resolve, options } of pending) {
    assert.equal(options.signal.aborted, true);
    resolve({ ok: true, json: async () => ({ success: true, data: [{ id: "old-user" }] }) });
  }
  await prefetch;
  assert.equal(cache.getCachedReports(), null);
  assert.equal(cache.getCachedClaims(), null);
  assert.equal(sessionStorage.getItem("vaultq:reports-cache"), null);
});

function googleHarness({ databaseFails = false, missingUser = false, email = "student@example.com" } = {}) {
  const logs = [];
  const route = load("src/app/api/auth/google/callback/route.ts", {
    "next/server": {
      NextResponse: { redirect: (url) => ({
        url, cookies: { values: {}, set(name, value) { this.values[name] = value; } },
        headers: new Map(),
      }) },
    },
    "@/lib/prisma": { prisma: { user: { findFirst: async () => {
      if (databaseFails) throw Object.assign(new Error("connect failed postgresql://user:secret@db.example/vaultq"), { code: "P1001" });
      if (missingUser) return null;
      return { id: "student", name: "Student", email, role: "STUDENT", isActive: true };
    } } } },
    "@/lib/auth": { generateToken: () => "app-token" },
    "@/lib/db-retry": { withDbRetry: (operation) => operation() },
    "@/lib/request-origin": { getRequestOrigin: () => "https://vaultq.example" },
  }, {
    process: { env: { GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret" } },
    console: { error: (...args) => logs.push(args) },
    fetch: async (url, options) => {
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal);
      return { ok: true, json: async () => url.includes("/token")
        ? { access_token: "google-token" }
        : { email, email_verified: true } };
    },
  });
  const request = (query) => ({
    nextUrl: { searchParams: new URLSearchParams(query) },
    cookies: { get: (name) => ({ value: name === "g_state" ? "valid-state" : "login" }) },
  });
  return { route, request, logs };
}

test("Google callback consumes all OAuth cookies and creates a fresh session", async () => {
  const h = googleHarness();
  const response = await h.route.GET(h.request("code=test-code&state=valid-state"));
  assert.match(response.url, /\/auth\/callback\?token=app-token/);
  assert.equal(response.cookies.values.vq_role, "STUDENT");
  for (const key of ["g_state", "g_intent", "g_barcode"]) assert.equal(response.cookies.values[key], "");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("Google database failures are distinguishable without logging private details", async () => {
  const h = googleHarness({ databaseFails: true });
  const response = await h.route.GET(h.request("code=test-code&state=valid-state"));
  assert.match(decodeURIComponent(response.url), /Account service unavailable/);
  assert.equal(h.logs[0][1].stage, "account_lookup");
  assert.equal(h.logs[0][1].code, "P1001");
  const serialized = JSON.stringify(h.logs);
  assert.ok(!serialized.includes("secret"));
  assert.ok(serialized.includes("[redacted]"));
});

test("Google permission denial and invalid state show short specific errors", async () => {
  const h = googleHarness();
  const denied = await h.route.GET(h.request("error=access_denied"));
  assert.match(decodeURIComponent(denied.url), /sign-in was cancelled/);
  const invalid = await h.route.GET(h.request("code=test-code&state=wrong-state"));
  assert.match(decodeURIComponent(invalid.url), /Session expired/);
});

test("unauthorized Google accounts get one short message", async () => {
  const h = googleHarness({ missingUser: true, email: "staff@example.com" });
  const response = await h.route.GET(h.request("code=test-code&state=valid-state"));
  const message = new URL(response.url).searchParams.get("googleError");
  assert.equal(message, "Only @student.tarc.edu.my accounts can register with Google.");
  assert.ok(message.length < 70);
});

function retryModule() {
  return load("src/lib/db-retry.ts", {}, {
    setTimeout: (callback) => { callback(); return 0; },
  });
}

test("transient connection failures retry and then succeed", async () => {
  const { withDbRetry } = retryModule();
  let calls = 0;
  const result = await withDbRetry(async () => {
    calls++;
    if (calls < 2) throw Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 2);
});

test("non-connection errors are not retried", async () => {
  const { withDbRetry } = retryModule();
  let calls = 0;
  await assert.rejects(withDbRetry(async () => {
    calls++;
    throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  }));
  assert.equal(calls, 1);
});

test("connection retries stop after three attempts", async () => {
  const { withDbRetry } = retryModule();
  let calls = 0;
  await assert.rejects(withDbRetry(async () => {
    calls++;
    throw Object.assign(new Error("Can't reach database server"), { code: "P1001" });
  }), /reach database/);
  assert.equal(calls, 3);
});

test("Prisma uses bounded serverless pool settings", () => {
  const captured = {};
  load("src/lib/prisma.ts", {
    "@/generated/prisma/client": { PrismaClient: class { constructor(options) { captured.client = options; } } },
    "@prisma/adapter-pg": { PrismaPg: class { constructor(config, options) { captured.config = config; captured.options = options; } } },
  }, {
    process: { env: { NODE_ENV: "test", DATABASE_URL: "postgresql://test" } },
    console: { warn: () => {} },
  });
  assert.equal(captured.config.max, 5);
  assert.equal(captured.config.idleTimeoutMillis, 10_000);
  assert.equal(captured.config.connectionTimeoutMillis, 5_000);
  assert.equal(captured.config.allowExitOnIdle, true);
  assert.equal(captured.config.application_name, "vaultq");
  assert.equal(typeof captured.options.onPoolError, "function");
  assert.equal(typeof captured.options.onConnectionError, "function");
});

test("photo sources are deduplicated without dropping distinct uploads", () => {
  const { uniquePhotos } = load("src/lib/photo-gallery.ts", {});
  assert.deepEqual(Array.from(uniquePhotos([null, "", "photo-a", "photo-a", "photo-b", undefined])), ["photo-a", "photo-b"]);
});

test("item detail photos prefer the original image over the signed list URL", () => {
  const { itemPhotoSources } = load("src/lib/photo-dedupe.ts", {
    "./photo-gallery": load("src/lib/photo-gallery.ts", {}),
  });
  assert.deepEqual(
    Array.from(itemPhotoSources("signed-item-url", "raw-item-image", ["raw-item-image", "second-photo"])),
    ["raw-item-image", "second-photo"],
  );
  assert.deepEqual(Array.from(itemPhotoSources("signed-item-url", null, [])), ["signed-item-url"]);
});

test("visually identical photos are deduplicated by decoded pixels", () => {
  const { dedupePhotoPixels } = load("src/lib/photo-dedupe.ts", {
    "./photo-gallery": load("src/lib/photo-gallery.ts", {}),
  });
  const first = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  const reencoded = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  const secondAngle = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 9, 255]);
  const result = dedupePhotoPixels([
    { source: "item-photo", pixels: first },
    { source: "report-copy", pixels: reencoded },
    { source: "second-angle", pixels: secondAngle },
    { source: "undecodable", pixels: null },
  ]);
  assert.deepEqual(Array.from(result), ["item-photo", "second-angle", "undecodable"]);
});

test("photo dedupe falls back to exact sources without a browser DOM", async () => {
  const { dedupePhotos } = load("src/lib/photo-dedupe.ts", {
    "./photo-gallery": load("src/lib/photo-gallery.ts", {}),
  });
  assert.deepEqual(Array.from(await dedupePhotos(["photo-a", "photo-a", "photo-b"])), ["photo-a", "photo-b"]);
});

async function listClaimPhotos(reportSources, light = true, main = "photo-a") {
  const photos = load("src/lib/photo-gallery.ts", {});
  const route = load("src/app/api/claims/route.ts", {
    "next/server": { NextResponse: { json: (body) => body } },
    "@/lib/auth": { authenticateRequest: async () => ({ id: "admin", role: "ADMIN" }) },
    "@/lib/photo-gallery": photos,
    "@/lib/image-url": { signedImageUrl: (kind, id, index) => `/images/${kind}/${id}/${index}` },
    "@/lib/prisma": { prisma: { claim: { findMany: async () => [{
      id: "claim", itemId: "item", userId: "student", status: "PENDING",
      evidenceImageUrls: ["evidence"], createdAt: "2026-11-10T12:00:00Z",
      item: { imageUrl: main, reports: [{ id: "report", imageUrl: reportSources[0], imageUrls: reportSources }] },
    }] } } },
  }, { URL });
  return route.GET({ url: `https://vaultq.example/api/claims${light ? "?light=1" : ""}` });
}

test("two uploaded found photos produce two signed photos, not three", async () => {
  const result = await listClaimPhotos(["photo-a", "photo-b"]);
  assert.equal(result.success, true);
  assert.deepEqual(Array.from(result.data[0].item.imageUrls), ["/images/item/item/0", "/images/report/report/1"]);
});

test("duplicate report entries retain the second unique photo's original source index", async () => {
  const result = await listClaimPhotos(["photo-a", "photo-a", "photo-b"]);
  assert.deepEqual(Array.from(result.data[0].item.imageUrls), ["/images/item/item/0", "/images/report/report/2"]);
});

test("full claim payload also exposes a canonical deduplicated photo list", async () => {
  const result = await listClaimPhotos(["photo-a", "photo-b"], false);
  assert.deepEqual(Array.from(result.data[0].item.imageUrls), ["photo-a", "photo-b"]);
});

test("found photos work when the item has no separate main photo", async () => {
  const result = await listClaimPhotos(["photo-a", "photo-b"], true, null);
  assert.deepEqual(Array.from(result.data[0].item.imageUrls), ["/images/report/report/0", "/images/report/report/1"]);
});

async function listReportPhotos(sources) {
  const photos = load("src/lib/photo-gallery.ts", {});
  const route = load("src/app/api/reports/route.ts", {
    "next/server": { NextResponse: { json: (body) => body } },
    "@/lib/prisma": { prisma: { report: { findMany: async () => [{
      id: "report", imageUrl: sources[0], imageUrls: sources, item: null,
    }] } } },
    "@/lib/auth": { authenticateRequest: async () => ({ id: "admin", role: "ADMIN" }) },
    "@/lib/categories": { isItemCategory: () => true },
    "@/lib/notification-service": { notifyUser: async () => {} },
    "@/lib/report-include": { REPORT_INCLUDE: {} },
    "@/lib/report-validation": { VALID_REPORT_TYPES: ["LOST", "FOUND"], validateReportDetails: () => ({ ok: true, value: {} }) },
    "@/lib/image-url": { signedImageUrl: (kind, id, index) => `/images/${kind}/${id}/${index}` },
    "@/lib/photo-gallery": photos,
  }, { URL });
  return route.GET({ url: "https://vaultq.example/api/reports?light=1" });
}

test("My Reports signing deduplicates the same uploaded photo", async () => {
  const result = await listReportPhotos(["photo-a", "photo-a", "photo-b"]);
  assert.deepEqual(Array.from(result.data[0].imageUrls), ["/images/report/report/0", "/images/report/report/1"]);
  assert.equal(result.data[0].imageUrl, "/images/report/report/0");
});

test("My Reports mapping deduplicates photos without dropping distinct uploads", () => {
  const photos = load("src/lib/photo-gallery.ts", {});
  const { mapReport } = load("src/lib/report-mapper.ts", {
    "./item-mapper": { toDateOnly: (value) => String(value || "").slice(0, 10) },
    "./photo-gallery": photos,
  });
  const report = mapReport({
    id: "report", type: "LOST", itemName: "Bag", date: "2026-11-10",
    imageUrl: "photo-a", imageUrls: ["photo-a", "photo-a", "photo-b"],
  });
  assert.deepEqual(Array.from(report.images), ["photo-a", "photo-b"]);
  assert.equal(report.imageUrl, "photo-a");
});

function themeHarness({ snapshots = true, reducedMotion = false } = {}) {
  const classes = new Set();
  const pending = [];
  const timers = [];
  const root = {
    style: {},
    classList: {
      contains: (name) => classes.has(name),
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
    },
  };
  const document = { documentElement: root };
  if (snapshots) document.startViewTransition = (update) => {
    let finish;
    const transition = {
      ready: Promise.resolve(), finished: new Promise(resolve => { finish = resolve; }),
      skipTransition: () => { transition.skipped = true; },
      update, finish: () => finish(), skipped: false,
    };
    pending.push(transition);
    return transition;
  };
  const theme = load("src/lib/theme.ts", {}, {
    document,
    window: { matchMedia: () => ({ matches: reducedMotion }), getComputedStyle: () => ({ backgroundColor: "white" }) },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    clearTimeout: () => {},
  });
  return { theme, root, classes, pending, timers };
}

test("supported browsers switch all theme variables in a single snapshot update", async () => {
  const h = themeHarness();
  h.theme.setTheme(true);
  assert.ok(h.classes.has("theme-snapshot-transition"));
  assert.ok(!h.classes.has("theme-transitioning"));
  assert.ok(!h.classes.has("dark"));
  h.pending[0].update();
  assert.ok(h.classes.has("dark"));
  assert.equal(h.root.style.colorScheme, "dark");
  h.pending[0].finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!h.classes.has("theme-snapshot-transition"));
});

test("rapid toggles cannot let an older snapshot overwrite the latest theme", async () => {
  const h = themeHarness();
  h.theme.setTheme(true);
  h.theme.setTheme(false);
  assert.ok(h.pending[0].skipped);
  h.theme.setTheme(true);
  h.pending[0].update();
  h.pending[0].finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.classes.has("theme-snapshot-transition"));
  assert.ok(!h.classes.has("dark"));
  h.pending[1].update();
  h.pending[1].finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.classes.has("dark"));
  assert.ok(!h.classes.has("theme-snapshot-transition"));
});

test("reduced motion switches immediately without snapshots or color animation", () => {
  const h = themeHarness({ reducedMotion: true });
  h.theme.setTheme(true);
  assert.deepEqual([...h.classes], ["dark"]);
  assert.equal(h.pending.length, 0);
});

test("older browsers use a temporary synchronized theme fallback", () => {
  const h = themeHarness({ snapshots: false });
  h.theme.setTheme(true);
  assert.ok(h.classes.has("dark"));
  assert.ok(h.classes.has("theme-transitioning"));
  h.timers[0]();
  assert.ok(!h.classes.has("theme-transitioning"));
});

test("admin lists coalesce concurrent loads, cache repeats and invalidate after mutations", async () => {
  let calls = 0;
  const cache = load("src/lib/admin-data.ts", {}, { Response, fetch: async () => {
    calls++;
    return Response.json({ success: true, data: [{ id: "record" }] });
  } });
  const [first, second] = await Promise.all([
    cache.fetchAdminData("/api/accounts", "admin-a"),
    cache.fetchAdminData("/api/accounts", "admin-a"),
  ]);
  assert.equal(calls, 1);
  assert.equal((await first.json()).data[0].id, "record");
  assert.equal((await second.json()).data[0].id, "record");
  await cache.fetchAdminData("/api/accounts", "admin-a");
  assert.equal(calls, 1);
  cache.invalidateAdminData();
  await cache.fetchAdminData("/api/accounts", "admin-a");
  assert.equal(calls, 2);
  await cache.fetchAdminData("/api/accounts", "admin-b");
  assert.equal(calls, 3, "another account must not receive the old account's cache");
});

test("logout prevents an old admin request from repopulating the list cache", async () => {
  let finish;
  let calls = 0;
  const cache = load("src/lib/admin-data.ts", {}, { Response, fetch: () => {
    calls++;
    if (calls > 1) return Promise.resolve(Response.json({ success: true, data: [] }));
    return new Promise(resolve => { finish = resolve; });
  } });
  const first = cache.fetchAdminData("/api/accounts", "admin-a");
  cache.clearAdminData();
  finish(Response.json({ success: true, data: [{ id: "old-account" }] }));
  await assert.rejects(first, /superseded/);
  await cache.fetchAdminData("/api/accounts", "admin-a");
  assert.equal(calls, 2);
});

function inventoryRoute(status, changedCount = 1) {
  const writes = [];
  const existing = { id: "item", status, lockerId: null, _count: { claims: 0 } };
  const tx = { item: {
    updateMany: async (args) => { writes.push(args); return { count: changedCount }; },
    deleteMany: async (args) => { writes.push(args); return { count: changedCount }; },
    findUnique: async () => existing,
  } };
  const route = load("src/app/api/items/[id]/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    "@/lib/auth": { authenticateRequest: async () => ({ role: "ADMIN" }) },
    "@/lib/text-validation": { startsWithNumber: () => false },
    "@/lib/prisma": { prisma: { item: { findUnique: async () => existing }, $transaction: (operation) => operation(tx) } },
  });
  return { route, writes, context: { params: Promise.resolve({ id: "item" }) }, request: { json: async () => ({ description: "changed" }) } };
}

test("claimed and retrieved inventory cannot be edited or deleted through the API", async () => {
  for (const status of ["CLAIMED", "RETRIEVED"]) {
    const h = inventoryRoute(status);
    assert.equal((await h.route.PATCH(h.request, h.context)).status, 409);
    assert.equal((await h.route.DELETE(h.request, h.context)).status, 409);
    assert.equal(h.writes.length, 0);
  }
});

test("inventory write guards also catch a claim approved after the initial read", async () => {
  const h = inventoryRoute("FOUND", 0);
  assert.equal((await h.route.PATCH(h.request, h.context)).status, 409);
  assert.equal((await h.route.DELETE(h.request, h.context)).status, 409);
  for (const write of h.writes) assert.deepEqual(Array.from(write.where.status.notIn), ["CLAIMED", "RETRIEVED"]);
});

test("unclaimed inventory can still be edited", async () => {
  const h = inventoryRoute("FOUND");
  assert.equal((await h.route.PATCH(h.request, h.context)).status, 200);
  assert.equal(h.writes.length, 1);
});

function profileRoute({ currentBarcode = "2000132602" } = {}) {
  const writes = [];
  const route = load("src/app/api/user/profile/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    "@/lib/prisma": { prisma: { user: {
      findFirst: async () => null,
      update: async (args) => {
        writes.push(args);
        return { id: "student", name: "Student", email: "student@example.com", role: "STUDENT", studentId: null, cardBarcode: currentBarcode, ...args.data };
      },
    } } },
    "@/lib/auth": { authenticateRequest: async () => ({ id: "student", name: "Student", email: "student@example.com", role: "STUDENT", cardBarcode: currentBarcode, isActive: true }) },
    "@/lib/person-name": { getPersonNameError: () => null },
    "@/lib/student-id": { isValidStudentId: () => true, normalizeStudentId: (value) => value, STUDENT_ID_ERROR_MESSAGE: "Invalid student ID" },
  });
  return { route, writes };
}

test("students cannot change an assigned card barcode through the profile API", async () => {
  const h = profileRoute();
  const response = await h.route.PATCH({ json: async () => ({ cardBarcode: "9999999999" }) });
  assert.equal(response.status, 403);
  assert.match(response.body.error, /cannot be changed/i);
  assert.equal(h.writes.length, 0);
});

test("a legacy account without a barcode can still set one once", async () => {
  const h = profileRoute({ currentBarcode: null });
  const response = await h.route.PATCH({ json: async () => ({ cardBarcode: "2000132602" }) });
  assert.equal(response.status, 200);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].data.cardBarcode, "2000132602");
});

test("sign-up redirects to login instead of creating a session", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src/app/(auth)/register/page.tsx"), "utf8");
  assert.match(source, /router\.push\("\/login\?skip=1&registered=1"\)/);
  assert.ok(!source.includes('localStorage.setItem("token", data.data.token)'));
  assert.ok(!source.includes('localStorage.setItem("user", JSON.stringify(data.data.user))'));
});
