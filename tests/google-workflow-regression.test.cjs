/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");
const server = require("next/server");

function load(file, deps = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, URL, URLSearchParams, AbortSignal, crypto,
    process: { env: { NODE_ENV: "production", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret" } },
    console: { error() {} }, ...globals,
    require(id) { assert.ok(id in deps, `Unexpected dependency: ${id}`); return deps[id]; },
  });
  return exports;
}

function harness(options = {}) {
  const calls = { fetch: [], lookup: [], sessions: [] };
  const origin = "https://vaultq.example";
  const cookies = load("src/lib/session-cookie.ts");
  const deps = {
    "next/server": server,
    "@/lib/request-origin": { getRequestOrigin: () => origin },
    "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => options.limited ? server.NextResponse.json({ success: false }, { status: 429 }) : null },
    "@/lib/prisma": { prisma: { user: { findFirst: async query => {
      calls.lookup.push(query);
      if (options.databaseFailure) throw new Error("database unavailable");
      return options.newUser ? null : { id: "student", role: "STUDENT", isActive: !options.disabled };
    } } } },
    "@/lib/auth": { createAuthSession: async user => { calls.sessions.push(user); return "test-session-token"; } },
    "@/lib/db-retry": { withDbRetry: fn => fn() },
    "@/lib/session-cookie": cookies,
  };
  const callback = load("src/app/api/auth/google/callback/route.ts", deps, {
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      if (options.networkFailure) throw new Error("network unavailable");
      if (url.endsWith("/token")) return {
        ok: !options.tokenFailure, status: options.tokenFailure ? 400 : 200,
        json: async () => options.tokenFailure ? { error: "invalid_grant" } : { access_token: "provider-token" },
      };
      return { ok: !options.profileFailure, status: options.profileFailure ? 503 : 200,
        json: async () => ({ email: options.email || "student@student.tarc.edu.my", email_verified: !options.unverified, name: "Test Student" }) };
    },
  });
  const start = load("src/app/api/auth/google/route.ts", deps);
  const request = (query = "code=test-code&state=valid-state", cookie = "g_state=valid-state; g_intent=login") => new server.NextRequest(`${origin}/api/auth/google/callback?${query}`, { headers: { cookie } });
  return { calls, callback, start, request };
}

test("Google entry sets short-lived HttpOnly state and correct callback/account-picker parameters", async () => {
  const h = harness();
  const response = await h.start.GET(new server.NextRequest("https://vaultq.example/api/auth/google?intent=signup&bc=1234567890"));
  const target = new URL(response.headers.get("location"));
  assert.equal(target.origin, "https://accounts.google.com");
  assert.equal(target.searchParams.get("redirect_uri"), "https://vaultq.example/api/auth/google/callback");
  assert.equal(target.searchParams.get("prompt"), "select_account");
  assert.equal(response.cookies.get("g_state").value, target.searchParams.get("state"));
  for (const name of ["g_state", "g_intent", "g_barcode"]) {
    const cookie = response.cookies.get(name);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.maxAge, 600);
  }
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("Google callback rejects missing or mismatched state before contacting Google or database", async () => {
  for (const [query, cookie] of [["code=c&state=wrong", "g_state=valid-state"], ["code=c&state=valid-state", ""], ["code=c", "g_state=valid-state"]]) {
    const h = harness();
    const response = await h.callback.GET(h.request(query, cookie));
    assert.match(new URL(response.headers.get("location")).searchParams.get("googleError"), /Session expired/);
    assert.equal(h.calls.fetch.length, 0);
    assert.equal(h.calls.lookup.length, 0);
    assert.equal(h.calls.sessions.length, 0);
  }
});

test("Google callback refuses an unverified email before account lookup", async () => {
  const h = harness({ unverified: true });
  const response = await h.callback.GET(h.request());
  assert.match(new URL(response.headers.get("location")).searchParams.get("googleError"), /Verify your Google email/);
  assert.equal(h.calls.lookup.length, 0);
  assert.equal(h.calls.sessions.length, 0);
});

test("disabled Google-linked accounts cannot create a session", async () => {
  const h = harness({ disabled: true });
  const response = await h.callback.GET(h.request());
  assert.match(new URL(response.headers.get("location")).searchParams.get("googleError"), /Account disabled/);
  assert.equal(h.calls.sessions.length, 0);
});

test("signup intent does not silently log an already registered Google account in", async () => {
  const h = harness();
  const response = await h.callback.GET(h.request(undefined, "g_state=valid-state; g_intent=signup"));
  assert.match(new URL(response.headers.get("location")).searchParams.get("googleError"), /already registered/);
  assert.equal(h.calls.sessions.length, 0);
});

test("new campus Google identity returns to signup without creating a user or session", async () => {
  const h = harness({ newUser: true });
  const response = await h.callback.GET(h.request(undefined, "g_state=valid-state; g_intent=signup; g_barcode=1234567890"));
  const target = new URL(response.headers.get("location"));
  assert.equal(target.pathname, "/register");
  assert.equal(target.searchParams.get("email"), "student@student.tarc.edu.my");
  assert.equal(target.searchParams.get("barcode"), "1234567890");
  assert.equal(h.calls.sessions.length, 0);
});

test("new non-campus Google identities are rejected", async () => {
  const h = harness({ newUser: true, email: "person@example.com" });
  const response = await h.callback.GET(h.request());
  assert.match(new URL(response.headers.get("location")).searchParams.get("googleError"), /Only @student.tarc.edu.my/);
  assert.equal(h.calls.sessions.length, 0);
});

test("Google token, profile, network and database failures return safe errors without a session", async () => {
  for (const options of [{ tokenFailure: true }, { profileFailure: true }, { networkFailure: true }, { databaseFailure: true }]) {
    const h = harness(options);
    const response = await h.callback.GET(h.request());
    const target = new URL(response.headers.get("location"));
    assert.equal(target.pathname, "/login");
    assert.ok(target.searchParams.get("googleError"));
    assert.equal(h.calls.sessions.length, 0);
    assert.equal(response.cookies.get("vq_session"), undefined);
    for (const name of ["g_state", "g_intent", "g_barcode"]) assert.equal(response.cookies.get(name).maxAge, 0);
  }
});

test("Google callback throttling stops exchange and clears transient cookies", async () => {
  const h = harness({ limited: true });
  const response = await h.callback.GET(h.request());
  assert.equal(response.status, 429);
  assert.equal(h.calls.fetch.length, 0);
  assert.equal(response.cookies.get("g_state").maxAge, 0);
});

test("successful Google callback sets a secure HttpOnly session without URL credentials", async () => {
  const h = harness({ email: " Student@Student.Tarc.Edu.My " });
  const response = await h.callback.GET(h.request());
  assert.equal(response.headers.get("location"), "https://vaultq.example/auth/callback");
  assert.equal(h.calls.lookup[0].where.email.equals, "student@student.tarc.edu.my");
  assert.equal(h.calls.sessions.length, 1);
  const cookie = response.cookies.get("vq_session");
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.value, "test-session-token");
  for (const name of ["g_state", "g_intent", "g_barcode"]) assert.equal(response.cookies.get(name).maxAge, 0);
});
