/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const jwt = require("jsonwebtoken");

const ROOT = path.join(__dirname, "..");
const SECRET = "vaultq-test-jwt-secret-that-is-long-enough-1234567890";
const OTHER_SECRET = "another-vaultq-test-secret-that-is-long-enough-098765";
const ISSUER = "vaultq";
const AUDIENCE = "vaultq-web";

function load(file, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    Buffer,
    Date,
    JSON,
    Map,
    Math,
    Number,
    Promise,
    Set,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setImmediate,
    process: { env: {} },
    console,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return exports;
}

function requestDouble({ url = "https://vaultq.example/api/auth/login", headers = {}, cookies = {}, method = "POST" } = {}) {
  return {
    method,
    url,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    cookies: { get: (name) => (name in cookies ? { value: cookies[name] } : undefined) },
  };
}

function responseDouble() {
  return {
    status: 200,
    body: undefined,
    headers: new Map(),
    cookies: {
      values: {},
      set(name, value, options) { this.values[name] = { value, options }; },
    },
  };
}

// ---------------------------------------------------------------------------
// Secret handling
// ---------------------------------------------------------------------------

function secretsHarness(env = {}) {
  const process = { env: { ...env } };
  const secrets = load("src/lib/auth-secrets.ts", {
    "node:crypto": require("node:crypto"),
  }, { process });
  return { secrets, process };
}

test("missing, weak, padded and known-fallback JWT secrets are rejected", () => {
  for (const secret of [
    undefined,
    "",
    "short",
    "   " + "a".repeat(40),
    "vaultq-secret-key-change-in-production",
  ]) {
    const { secrets } = secretsHarness(secret === undefined ? {} : { JWT_SECRET: secret });
    assert.throws(() => secrets.getJwtSecret(), /JWT_SECRET/);
  }
  const { secrets } = secretsHarness({ JWT_SECRET: SECRET });
  assert.equal(secrets.getJwtSecret(), SECRET);
});

test("image signing uses a domain-separated key and validates explicit overrides", () => {
  const derived = secretsHarness({ JWT_SECRET: SECRET }).secrets;
  const first = derived.getImageSigningSecret();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, SECRET);
  assert.equal(derived.getImageSigningSecret(), first, "derived key is stable");

  const explicit = secretsHarness({ JWT_SECRET: SECRET, IMAGE_SIGNING_SECRET: "i".repeat(40) }).secrets;
  assert.equal(explicit.getImageSigningSecret(), "i".repeat(40));
  const weak = secretsHarness({ JWT_SECRET: SECRET, IMAGE_SIGNING_SECRET: "short" }).secrets;
  assert.throws(() => weak.getImageSigningSecret(), /IMAGE_SIGNING_SECRET/);
});

// ---------------------------------------------------------------------------
// Signed tokens and persistent sessions
// ---------------------------------------------------------------------------

function tokenHarness(secret = SECRET) {
  const process = { env: { JWT_SECRET: secret } };
  const secrets = load("src/lib/auth-secrets.ts", {
    "node:crypto": require("node:crypto"),
  }, { process });
  const tokens = load("src/lib/session-token.ts", {
    jsonwebtoken: { __esModule: true, default: jwt },
    "./auth-secrets": secrets,
  }, { process });
  return { tokens, process };
}

function authHarness() {
  const { tokens, process } = tokenHarness();
  const state = {
    created: null,
    deleted: [],
    session: null,
    lookups: [],
  };
  const prisma = {
    authSession: {
      create: async ({ data }) => { state.created = data; return { id: data.id }; },
      findUnique: async (args) => { state.lookups.push(args); return state.session; },
      deleteMany: async (args) => { state.deleted.push(args); return { count: 1 }; },
    },
  };
  const auth = load("src/lib/auth.ts", {
    bcryptjs: { __esModule: true, default: require("bcryptjs") },
    "next/server": {},
    "./prisma": { prisma },
    "./db-retry": { withDbRetry: (operation) => operation() },
    "./session-token": tokens,
    "./session-cookie": cookieHarness().cookies,
    "node:crypto": require("node:crypto"),
  }, { process });
  return { auth, tokens, state };
}

function sessionRecord(overrides = {}) {
  return {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date(Date.now() + 60_000),
    user: { id: "user-1", name: "Student", email: "student@example.test", role: "STUDENT", cardBarcode: null, isActive: true },
    ...overrides,
  };
}

test("generated tokens use HS256 with the expected issuer, audience and session id", () => {
  const { tokens } = tokenHarness();
  const token = tokens.generateToken({ userId: "user-1", role: "STUDENT", sessionId: "session-1" });
  const decoded = jwt.decode(token, { complete: true });
  assert.equal(decoded.header.alg, "HS256");
  assert.equal(decoded.payload.iss, ISSUER);
  assert.equal(decoded.payload.aud, AUDIENCE);
  assert.equal(decoded.payload.jti, "session-1");
  assert.equal(decoded.payload.userId, "user-1");
  assert.equal(decoded.payload.role, "STUDENT");
  assert.ok(decoded.payload.exp > Math.floor(Date.now() / 1000));

  const claims = tokens.verifyToken(token);
  assert.equal(claims.jti, "session-1");
  assert.equal(claims.role, "STUDENT");
});

test("tokens with the wrong algorithm, issuer, audience, shape, signature or expiry are rejected", () => {
  const { tokens } = tokenHarness();
  const claims = { userId: "user-1", role: "STUDENT" };
  const options = { issuer: ISSUER, audience: AUDIENCE, jwtid: "session-1", expiresIn: "1h" };

  const wrongAlgorithm = jwt.sign(claims, SECRET, { ...options, algorithm: "HS512" });
  const wrongIssuer = jwt.sign(claims, SECRET, { ...options, issuer: "someone-else" });
  const wrongAudience = jwt.sign(claims, SECRET, { ...options, audience: "another-app" });
  const missingSession = jwt.sign(claims, SECRET, { issuer: ISSUER, audience: AUDIENCE, expiresIn: "1h" });
  const invalidRole = jwt.sign({ ...claims, role: "SUPERADMIN" }, SECRET, options);
  const wrongSecret = jwt.sign(claims, OTHER_SECRET, options);
  const expired = jwt.sign(claims, SECRET, { ...options, expiresIn: -1 });

  for (const token of [wrongAlgorithm, wrongIssuer, wrongAudience, missingSession, invalidRole, wrongSecret, expired]) {
    assert.throws(() => tokens.verifyToken(token), /Invalid session token|jwt|invalid/i);
  }

  const unsigned = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ ...claims, jti: "session-1", iss: ISSUER, aud: AUDIENCE, exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url"),
    "",
  ].join(".");
  assert.throws(() => tokens.verifyToken(unsigned));

  assert.equal(tokens.verifyToken(expired, true).jti, "session-1");
});

test("session creation persists a matching id and the token remains usable only with that record", async () => {
  const h = authHarness();
  const token = await h.auth.createAuthSession({ id: "user-1", role: "STUDENT" });
  assert.equal(h.state.created.userId, "user-1");
  assert.ok(h.state.created.expiresAt instanceof Date);
  const claims = h.tokens.verifyToken(token);
  assert.equal(h.state.created.id, claims.jti);

  h.state.session = sessionRecord({ id: claims.jti });
  assert.equal((await h.auth.authenticateToken(token)).id, "user-1");
});

test("revoked, expired, inactive and role-changed sessions are rejected", async () => {
  const h = authHarness();
  const token = h.tokens.generateToken({ userId: "user-1", role: "STUDENT", sessionId: "session-1" });

  const cases = [
    { label: "revoked/missing", session: null },
    { label: "expired", session: sessionRecord({ expiresAt: new Date(Date.now() - 1) }) },
    { label: "foreign user", session: sessionRecord({ userId: "user-2" }) },
    { label: "inactive", session: sessionRecord({ user: { ...sessionRecord().user, isActive: false } }) },
    { label: "role changed", session: sessionRecord({ user: { ...sessionRecord().user, role: "ADMIN" } }) },
  ];
  for (const entry of cases) {
    h.state.session = entry.session;
    assert.equal(await h.auth.authenticateToken(token), null, entry.label);
  }

  h.state.session = sessionRecord();
  assert.equal((await h.auth.authenticateToken(token)).id, "user-1");
});

test("logout revokes exactly the persisted session and ignores unverifiable tokens", async () => {
  const h = authHarness();
  const token = h.tokens.generateToken({ userId: "user-1", role: "STUDENT", sessionId: "session-1" });
  await h.auth.revokeAuthSession(token);
  assert.equal(h.state.deleted.length, 1);
  assert.equal(h.state.deleted[0].where.id, "session-1");
  assert.equal(h.state.deleted[0].where.userId, "user-1");

  h.state.deleted.length = 0;
  await h.auth.revokeAuthSession(jwt.sign({ userId: "user-1", role: "STUDENT" }, OTHER_SECRET, {
    issuer: ISSUER, audience: AUDIENCE, jwtid: "session-1",
  }));
  assert.equal(h.state.deleted.length, 0);
});

test("API authentication requires an HttpOnly cookie, rejects bearer-only credentials and guards mutations", async () => {
  const h = authHarness();
  const token = h.tokens.generateToken({ userId: "user-1", role: "STUDENT", sessionId: "session-1" });
  h.state.session = sessionRecord();
  assert.equal(await h.auth.authenticateRequest(requestDouble({ method: "GET" })), null);
  assert.equal(await h.auth.authenticateRequest(requestDouble({ method: "GET", headers: { authorization: `Bearer ${token}`, "x-vaultq-session": "session-1" } })), null);
  assert.equal((await h.auth.authenticateRequest(requestDouble({ method: "GET", cookies: { vq_session: token } }))).id, "user-1");
  assert.equal(await h.auth.authenticateRequest(requestDouble({ cookies: { vq_session: token }, headers: { origin: "https://evil.example" } })), null);
  assert.equal(await h.auth.authenticateRequest(requestDouble({ cookies: { vq_session: token }, headers: { origin: "https://vaultq.example", "x-vaultq-session": "old-session" } })), null);
  assert.equal((await h.auth.authenticateRequest(requestDouble({ cookies: { vq_session: token }, headers: { origin: "https://vaultq.example", "x-vaultq-session": "session-1" } }))).id, "user-1");
});

// ---------------------------------------------------------------------------
// DAL and proxy split
// ---------------------------------------------------------------------------

test("DAL performs the authoritative session check and redirects missing or wrong-role users", async () => {
  const redirects = [];
  const context = { cookie: undefined, user: null, calls: 0 };
  const dal = load("src/lib/dal.ts", {
    react: { cache: (fn) => fn },
    "next/headers": { cookies: async () => ({ get: (name) => (name === "vq_session" && context.cookie ? { value: context.cookie } : undefined) }) },
    "next/navigation": { redirect: (url) => { redirects.push(url); throw { redirect: url }; } },
    "./auth": { authenticateToken: async () => { context.calls++; return context.user; } },
    "./session-cookie": { SESSION_COOKIE: "vq_session" },
  });

  await assert.rejects(() => dal.requireSession("STUDENT"), (error) => error.redirect === "/login?skip=1");
  assert.equal(context.calls, 0);

  context.cookie = "session-token";
  context.user = { id: "student", role: "STUDENT" };
  assert.equal((await dal.requireSession("STUDENT")).id, "student");

  context.user = { id: "admin", role: "ADMIN" };
  await assert.rejects(() => dal.requireSession("STUDENT"), (error) => error.redirect === "/dashboard/admin");
  assert.equal((await dal.requireSession("ADMIN")).id, "admin");
  assert.equal(redirects.filter((url) => url === "/dashboard/admin").length, 1);
});

test("dashboard layouts call the DAL with their required role", () => {
  const student = fs.readFileSync(path.join(ROOT, "src/app/dashboard/student/layout.tsx"), "utf8");
  const admin = fs.readFileSync(path.join(ROOT, "src/app/dashboard/admin/layout.tsx"), "utf8");
  assert.match(student, /requireSession\("STUDENT"\)/);
  assert.match(admin, /requireSession\("ADMIN"\)/);
});

function proxyHarness() {
  const { tokens, process } = tokenHarness();
  let last = null;
  const makeResponse = (kind, url) => ({
    kind,
    url,
    headers: new Map(),
    cookies: { values: {}, set(name, value, options) { this.values[name] = { value, options }; } },
  });
  const sessionCookie = load("src/lib/session-cookie.ts", {}, { process: { env: { ...process.env, NODE_ENV: "production" } } });
  const proxyModule = load("src/proxy.ts", {
    "next/server": {
      NextResponse: {
        redirect: (url) => { last = makeResponse("redirect", url); return last; },
        next: () => { last = makeResponse("next"); return last; },
      },
    },
    "@/lib/session-token": tokens,
    "@/lib/session-cookie": sessionCookie,
  }, { process });
  return {
    tokens,
    run: (pathname, cookies = {}) => {
      last = null;
      const nextUrl = {
        pathname,
        search: "",
        clone() { return { pathname, search: "", toString: () => "" }; },
      };
      proxyModule.proxy({
        cookies: { get: (name) => (name in cookies ? { value: cookies[name] } : undefined) },
        nextUrl,
        url: `https://vaultq.example${pathname}`,
      });
      return last;
    },
  };
}

test("Proxy rejects missing or forged role cookies and never trusts vq_role", () => {
  const h = proxyHarness();
  const missing = h.run("/dashboard/admin", { vq_role: "ADMIN" });
  assert.equal(missing.kind, "redirect");
  assert.equal(missing.url.pathname, "/login");
  assert.equal(missing.url.search, "?skip=1");
  assert.equal(missing.cookies.values.vq_session.value, "");

  const invalid = h.run("/dashboard/admin", { vq_session: "not-a-jwt", vq_role: "ADMIN" });
  assert.equal(invalid.kind, "redirect");
  assert.equal(invalid.url.pathname, "/login");

  const wrongSecretToken = jwt.sign({ userId: "user-1", role: "ADMIN" }, OTHER_SECRET, {
    issuer: ISSUER, audience: AUDIENCE, jwtid: "session-1", expiresIn: "1h",
  });
  assert.equal(h.run("/dashboard/admin", { vq_session: wrongSecretToken, vq_role: "ADMIN" }).kind, "redirect");

  const studentToken = h.tokens.generateToken({ userId: "student", role: "STUDENT", sessionId: "s1" });
  assert.equal(h.run("/dashboard/student", { vq_session: studentToken, vq_role: "ADMIN" }).kind, "next");
  assert.equal(h.run("/dashboard/admin", { vq_session: studentToken, vq_role: "ADMIN" }).kind, "redirect");

  const adminToken = h.tokens.generateToken({ userId: "admin", role: "ADMIN", sessionId: "s2" });
  assert.equal(h.run("/dashboard/admin", { vq_session: adminToken, vq_role: "STUDENT" }).kind, "next");
  assert.equal(h.run("/dashboard/student", { vq_session: adminToken, vq_role: "STUDENT" }).kind, "redirect");
});

test("Proxy remains database-free and delegates authoritative checks to the DAL", () => {
  const source = fs.readFileSync(path.join(ROOT, "src/proxy.ts"), "utf8");
  assert.ok(!source.includes("authenticateToken"));
  assert.ok(!source.includes("withDbRetry"));
  assert.ok(!source.includes("prisma"));
  assert.match(source, /verifyToken/);
});

// ---------------------------------------------------------------------------
// Cookie flags and CSRF/origin checks
// ---------------------------------------------------------------------------

function cookieHarness(env = {}) {
  const process = { env: { NODE_ENV: "production", ...env } };
  return { process, cookies: load("src/lib/session-cookie.ts", {}, { process }) };
}

test("session cookies are HttpOnly, secure and SameSite while the role hint is not HttpOnly", () => {
  const { cookies } = cookieHarness();
  const response = responseDouble();
  cookies.setSessionCookies(response, "session-token", "ADMIN");
  const session = response.cookies.values.vq_session;
  const role = response.cookies.values.vq_role;
  assert.equal(session.value, "session-token");
  assert.equal(session.options.httpOnly, true);
  assert.equal(session.options.secure, true);
  assert.equal(session.options.sameSite, "lax");
  assert.equal(session.options.maxAge, 7 * 24 * 60 * 60);
  assert.equal(role.options.httpOnly, undefined);
  assert.equal(role.options.secure, true);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");

  const cleared = responseDouble();
  cookies.clearSessionCookies(cleared);
  for (const name of ["vq_session", "vq_role"]) {
    assert.equal(cleared.cookies.values[name].value, "");
    assert.equal(cleared.cookies.values[name].options.maxAge, 0);
  }
});

test("same-origin mutation checks reject cross-site requests and unmarked headerless posts", () => {
  const { cookies } = cookieHarness();
  const origin = "https://vaultq.example";

  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: { origin } })), true);
  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: { origin: "https://evil.example" } })), false);
  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: { origin: "https://sub.vaultq.example" } })), false);
  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: { origin: "not a url" } })), false);

  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: {} })), false);
  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: { "x-vaultq-request": "1" } })), true);
  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: { "x-vaultq-request": "1", "sec-fetch-site": "cross-site" } })), false);
  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: { "x-vaultq-request": "1", "sec-fetch-site": "same-site" } })), false);
  assert.equal(cookies.isSameOriginAuthRequest(requestDouble({ headers: { "x-vaultq-request": "1", "sec-fetch-site": "same-origin" } })), true);
});

// ---------------------------------------------------------------------------
// Login route: CSRF, dummy hash, rate limiting and cookie issuance
// ---------------------------------------------------------------------------

function loginHarness({ rateLimit = null } = {}) {
  const state = { reads: 0, compares: [], sessions: 0, limited: 0 };
  const { cookies: cookieModule } = cookieHarness();
  const route = load("src/app/api/auth/login/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, init) => {
          const response = responseDouble();
          response.body = body;
          response.status = init?.status || 200;
          if (init?.headers) for (const [key, value] of Object.entries(init.headers)) response.headers.set(key, value);
          return response;
        },
      },
    },
    "@/lib/prisma": { prisma: { user: { findFirst: async () => { state.reads++; return null; } } } },
    "@/lib/auth": {
      comparePassword: async (password, hash) => { state.compares.push({ password, hash }); return false; },
      createAuthSession: async () => { state.sessions++; return "new-session"; },
    },
    "@/lib/db-retry": { withDbRetry: (operation) => operation() },
    "@/lib/session-cookie": cookieModule,
    "@/lib/auth-rate-limit": {
      enforceAuthRateLimit: async (request, action, identity) => {
        state.limited++;
        state.limitArgs = { action, identity };
        return rateLimit;
      },
    },
  });
  return { route, state, cookies: cookieModule };
}

test("login rejects cross-origin posts before reading the body, database or rate limiter", async () => {
  const h = loginHarness();
  let bodyRead = false;
  const response = await h.route.POST({
    ...requestDouble({ headers: { origin: "https://evil.example" } }),
    json: async () => { bodyRead = true; return {}; },
  });
  assert.equal(response.status, 403);
  assert.equal(bodyRead, false);
  assert.equal(h.state.reads, 0);
  assert.equal(h.state.limited, 0);
});

test("login returns the shared rate-limit response before looking up the account", async () => {
  const limited = { status: 429, body: { success: false }, headers: new Map([["Retry-After", "60"]]) };
  const h = loginHarness({ rateLimit: limited });
  const response = await h.route.POST({
    ...requestDouble({ headers: { origin: "https://vaultq.example" } }),
    json: async () => ({ email: "student@example.test", password: "password" }),
  });
  assert.equal(response, limited);
  assert.equal(h.state.reads, 0);
  assert.equal(h.state.limitArgs.identity, "student@example.test");
});

test("unknown accounts still run a dummy bcrypt comparison and never create a session", async () => {
  const h = loginHarness();
  const response = await h.route.POST({
    ...requestDouble({ headers: { origin: "https://vaultq.example" } }),
    json: async () => ({ email: "missing@example.test", password: "password" }),
  });
  assert.equal(response.status, 401);
  assert.equal(h.state.reads, 1);
  assert.equal(h.state.compares.length, 1);
  assert.match(h.state.compares[0].hash, /^\$2[aby]\$/);
  assert.notEqual(h.state.compares[0].hash, "password");
  assert.equal(h.state.sessions, 0);
});

test("successful login exposes public metadata only and stores credentials in HttpOnly cookies", async () => {
  const { tokens } = tokenHarness();
  const token = tokens.generateToken({ userId: "student", role: "STUDENT", sessionId: "s1" });
  const { cookies } = cookieHarness();
  const route = load("src/app/api/auth/login/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, init) => {
          const response = responseDouble();
          response.body = body;
          response.status = init?.status || 200;
          return response;
        },
      },
    },
    "@/lib/prisma": {
      prisma: {
        user: {
          findFirst: async () => ({
            id: "student",
            name: "Student",
            email: "student@example.test",
            role: "STUDENT",
            isActive: true,
            password: "hash",
            cardBarcode: "2000132602",
          }),
        },
      },
    },
    "@/lib/auth": { comparePassword: async () => true, createAuthSession: async () => token, verifyToken: tokens.verifyToken },
    "@/lib/db-retry": { withDbRetry: (operation) => operation() },
    "@/lib/session-cookie": cookies,
    "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => null },
  });
  const response = await route.POST({
    ...requestDouble({ headers: { origin: "https://vaultq.example" } }),
    json: async () => ({ email: "student@example.test", password: "password" }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.token, undefined);
  assert.equal(response.body.data.sessionKey, "s1");
  assert.ok(response.body.data.expiresAt > Date.now());
  assert.ok(!JSON.stringify(response.body).includes(token));
  assert.equal(response.cookies.values.vq_session.value, token);
  assert.equal(response.cookies.values.vq_role.value, "STUDENT");
});

// ---------------------------------------------------------------------------
// Session bootstrap and logout routes
// ---------------------------------------------------------------------------

function sessionRouteHarness() {
  const state = { revoked: [], restored: 0 };
  const { tokens } = tokenHarness();
  const token = tokens.generateToken({ userId: "student", role: "STUDENT", sessionId: "s1" });
  const { cookies } = cookieHarness();
  const route = load("src/app/api/auth/session/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, init) => {
          const response = responseDouble();
          response.body = body;
          response.status = init?.status || 200;
          if (init?.headers) for (const [key, value] of Object.entries(init.headers)) response.headers.set(key, value);
          return response;
        },
      },
    },
    "@/lib/auth": {
      verifyToken: tokens.verifyToken,
      authenticateToken: async (value) => value === token
        ? { id: "student", name: "Student", email: "student@example.test", role: "STUDENT", cardBarcode: null, isActive: true }
        : null,
    },
    "@/lib/session-cookie": cookies,
  });
  return { route, token, cookies, state };
}

test("session bootstrap exposes public metadata, never JWTs or bearer restoration", async () => {
  const h = sessionRouteHarness();

  const missing = await h.route.GET(requestDouble({ cookies: {} }));
  assert.equal(missing.status, 401);
  assert.equal(missing.cookies.values.vq_session.value, "");
  assert.equal(missing.cookies.values.vq_role.value, "");

  const valid = await h.route.GET(requestDouble({ cookies: { vq_session: h.token } }));
  assert.equal(valid.status, 200);
  assert.equal(valid.body.data.token, undefined);
  assert.equal(valid.body.data.sessionKey, "s1");
  assert.ok(valid.body.data.expiresAt > Date.now());
  assert.ok(!JSON.stringify(valid.body).includes(h.token));
  assert.equal(valid.body.data.user.role, "STUDENT");
  assert.equal(valid.headers.get("Cache-Control"), "private, no-store");
  assert.equal(valid.headers.get("Vary"), "Cookie");

  assert.equal(h.route.POST, undefined, "no credential-import endpoint remains");
  assert.equal((await h.route.GET(requestDouble({ headers: { authorization: `Bearer ${h.token}` } }))).status, 401);
});

function logoutHarness({ revokeFails = false } = {}) {
  const state = { revoked: [] };
  const { cookies } = cookieHarness();
  const route = load("src/app/api/auth/logout/route.ts", {
    "next/server": {
      NextResponse: {
        json: (body, init) => {
          const response = responseDouble();
          response.body = body;
          response.status = init?.status || 200;
          if (init?.headers) for (const [key, value] of Object.entries(init.headers)) response.headers.set(key, value);
          return response;
        },
      },
    },
    "@/lib/auth": {
      verifyToken: token => ({ jti: token }),
      revokeAuthSession: async (token) => {
        state.revoked.push(token);
        if (revokeFails) throw new Error("database unavailable");
      },
    },
    "@/lib/session-cookie": cookies,
  });
  return { route, state };
}

test("logout revokes the cookie session and clears both routing cookies", async () => {
  const h = logoutHarness();
  const response = await h.route.POST(requestDouble({
    headers: { origin: "https://vaultq.example" },
    cookies: { vq_session: "session-token" },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(h.state.revoked, ["session-token"]);
  assert.equal(response.cookies.values.vq_session.value, "");
  assert.equal(response.cookies.values.vq_role.value, "");
});

test("a stale tab logging out cannot clear a newer session cookie", async () => {
  const h = logoutHarness();
  const response = await h.route.POST(requestDouble({
    headers: { origin: "https://vaultq.example", "x-vaultq-session": "old-session" },
    cookies: { vq_session: "new-session" },
  }));
  assert.equal(response.status, 409);
  assert.deepEqual(h.state.revoked, []);
  assert.equal(response.cookies.values.vq_session, undefined);
  assert.equal(response.cookies.values.vq_role, undefined);
});

test("logout is same-origin only and reports store failures without clearing the browser state", async () => {
  const csrf = logoutHarness();
  const forbidden = await csrf.route.POST(requestDouble({ headers: { origin: "https://evil.example" }, cookies: { vq_session: "s" } }));
  assert.equal(forbidden.status, 403);
  assert.equal(csrf.state.revoked.length, 0);

  const failing = logoutHarness({ revokeFails: true });
  const response = await failing.route.POST(requestDouble({
    headers: { origin: "https://vaultq.example" },
    cookies: { vq_session: "session-token" },
  }));
  assert.equal(response.status, 503);
  assert.equal(response.cookies.values.vq_session, undefined);
});

// ---------------------------------------------------------------------------
// Shared rate limiting
// ---------------------------------------------------------------------------

function rateLimitHarness({ env = {}, rows = [{ attempts: 1, resetAt: new Date(Date.now() + 60_000), retryAfter: 60 }], fail = false } = {}) {
  const process = { env: { JWT_SECRET: SECRET, ...env } };
  const calls = { query: [], execute: [], errors: [] };
  const prisma = {
    $queryRaw: async (strings, ...values) => {
      calls.query.push({ strings: Array.from(strings), values });
      if (fail) throw new Error("database unavailable");
      return typeof rows === "function" ? rows(calls.query.length) : rows;
    },
    $executeRaw: async () => 1,
  };
  const mod = load("src/lib/auth-rate-limit.ts", {
    "node:crypto": require("node:crypto"),
    "node:net": require("node:net"),
    "next/server": {
      NextResponse: {
        json: (body, init) => {
          const response = responseDouble();
          response.body = body;
          response.status = init?.status || 200;
          if (init?.headers) for (const [key, value] of Object.entries(init.headers)) response.headers.set(key, value);
          return response;
        },
      },
    },
    "./prisma": { prisma },
    "./auth-secrets": { getJwtSecret: () => SECRET },
  }, {
    process,
    Math: { random: () => 0.5 },
    console: { error: (...args) => calls.errors.push(args) },
  });
  return { mod, calls, process };
}

test("client identity trusts only Vercel or an explicitly configured proxy", () => {
  const vercel = rateLimitHarness({ env: { VERCEL: "1" } });
  assert.equal(vercel.mod.authClientIdentity(requestDouble({
    headers: { "x-vercel-forwarded-for": "203.0.113.9, 10.0.0.1", "x-forwarded-for": "1.1.1.1" },
  })), "203.0.113.9");
  assert.equal(vercel.mod.authClientIdentity(requestDouble({ headers: { "x-vercel-forwarded-for": "not-an-ip" } })), "untrusted-client");

  const proxied = rateLimitHarness({ env: { AUTH_TRUST_PROXY: "true" } });
  assert.equal(proxied.mod.authClientIdentity(requestDouble({
    headers: { "x-forwarded-for": "2001:DB8::1" },
  })), "2001:db8::1");

  const untrusted = rateLimitHarness();
  assert.equal(untrusted.mod.authClientIdentity(requestDouble({
    headers: { "x-forwarded-for": "203.0.113.9", "x-vercel-forwarded-for": "203.0.113.9" },
  })), "untrusted-client");
});

test("rate-limit keys are hashed, unique per bucket and never contain the email or IP", async () => {
  const h = rateLimitHarness({ env: { VERCEL: "1" } });
  const result = await h.mod.checkAuthRateLimit(requestDouble({
    headers: { "x-vercel-forwarded-for": "203.0.113.9" },
  }), "login", "  Alex@Example.TEST ");
  assert.equal(result.allowed, true);
  assert.equal(h.calls.query.length, 3, "IP, account+IP and account buckets");
  const keys = h.calls.query.map((call) => call.values[0]);
  for (const key of keys) {
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.ok(!key.includes("alex"));
    assert.ok(!key.includes("203.0.113.9"));
  }
  assert.equal(new Set(keys).size, 3);
  for (const call of h.calls.query) {
    assert.ok(call.strings.join("").includes("ON CONFLICT"), "single atomic upsert");
    assert.ok(call.strings.join("").includes("LEAST"), "attempts are capped");
    assert.ok(call.strings.join("").includes("clock_timestamp"), "database clock is authoritative");
  }
});

test("rate limiting rejects over-limit buckets with Retry-After and skips later buckets", async () => {
  const h = rateLimitHarness({
    env: { VERCEL: "1" },
    rows: (call) => [{ attempts: call === 2 ? 11 : 1, resetAt: new Date(Date.now() + 120_000), retryAfter: 120 }],
  });
  const result = await h.mod.checkAuthRateLimit(requestDouble({
    headers: { "x-vercel-forwarded-for": "203.0.113.9" },
  }), "login", "student@example.test");
  assert.equal(result.allowed, false);
  assert.equal(result.retryAfter, 120);
  assert.equal(h.calls.query.length, 2);
});

test("public lookup and barcode actions use only the per-IP bucket", async () => {
  for (const action of ["lookup", "barcode", "register", "google"]) {
    const h = rateLimitHarness({ env: { VERCEL: "1" } });
    await h.mod.checkAuthRateLimit(requestDouble({ headers: { "x-vercel-forwarded-for": "203.0.113.9" } }), action);
    assert.equal(h.calls.query.length, 1, action);
  }
});

test("report, claim and suggestion limits follow the account across IP changes", async () => {
  for (const action of ["report", "claim", "suggestion"]) {
    const first = rateLimitHarness({ env: { VERCEL: "1" } });
    const second = rateLimitHarness({ env: { VERCEL: "1" } });
    await first.mod.checkAuthRateLimit(requestDouble({ headers: { "x-vercel-forwarded-for": "203.0.113.9" } }), action, "student-1");
    await second.mod.checkAuthRateLimit(requestDouble({ headers: { "x-vercel-forwarded-for": "203.0.113.10" } }), action, "student-1");
    assert.equal(first.calls.query.length, 2);
    assert.equal(first.calls.query[0].values[0], second.calls.query[0].values[0], "account bucket precedes IP bucket and is not bypassed by IP changes");
    assert.notEqual(first.calls.query[1].values[0], second.calls.query[1].values[0]);
    const blocked = rateLimitHarness({ rows: [{ attempts: action === "suggestion" ? 61 : 31, retryAfter: 30 }] });
    const result = await blocked.mod.enforceAuthRateLimit(requestDouble(), action, "student-1");
    assert.equal(result.status, 429);
    assert.equal(blocked.calls.query.length, 1);
  }
});

test("rate limiting fails closed with 503 and returns 429 with Retry-After", async () => {
  const failing = rateLimitHarness({ env: { VERCEL: "1" }, fail: true });
  const unavailable = await failing.mod.enforceAuthRateLimit(requestDouble({
    headers: { "x-vercel-forwarded-for": "203.0.113.9" },
  }), "login", "student@example.test");
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Retry-After"), "60");
  assert.equal(unavailable.headers.get("Cache-Control"), "no-store");
  assert.equal(failing.calls.errors.length, 1);
  assert.ok(!JSON.stringify(failing.calls.errors).includes("student@example.test"));

  const limited = rateLimitHarness({
    env: { VERCEL: "1" },
    rows: [{ attempts: 500, resetAt: new Date(Date.now() + 90_000), retryAfter: 90 }],
  });
  const response = await limited.mod.enforceAuthRateLimit(requestDouble({
    headers: { "x-vercel-forwarded-for": "203.0.113.9" },
  }), "lookup");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "90");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("client cleanup asks the server to revoke the token before removing local state", async () => {
  const revoked = [];
  const values = new Map([["token", "legacy-jwt"], ["vq_session_key", "session-key"], ["user", "{}"]]);
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const idle = load("src/lib/idle-session.ts", {
    "@/lib/student-cache": { clearStudentCache: () => {} },
    "@/lib/browser-session": { endServerSession: async (token) => { revoked.push(token); return true; } },
    "./browser-session-store": load("src/lib/browser-session-store.ts", {}, { localStorage }),
  }, {
    window: {},
    localStorage,
    document: { cookie: "" },
  });
  idle.clearClientSession();
  assert.deepEqual(revoked, ["session-key"]);
  assert.equal(localStorage.getItem("token"), null);
  assert.equal(localStorage.getItem("user"), null);
});

// ---------------------------------------------------------------------------
// Browser session restoration and logout ordering
// ---------------------------------------------------------------------------

function browserSessionHarness(fetchImpl) {
  const calls = [];
  const mod = load("src/lib/browser-session.ts", {}, {
    fetch: async (url, options) => {
      calls.push({ url, options });
      return fetchImpl(url, options, calls.length);
    },
    AbortSignal,
    URL,
  });
  return { mod, calls };
}

function sessionPayload(overrides = {}) {
  return {
    success: true,
    data: {
      sessionKey: "public-session-key",
      expiresAt: Date.now() + 60_000,
      user: { id: "student", name: "Student", email: "student@example.test", role: "STUDENT", cardBarcode: null },
      ...overrides,
    },
  };
}

test("browser session restoration accepts only a verified, well-formed server payload", async () => {
  const h = browserSessionHarness(async () => ({ status: 200, ok: true, json: async () => sessionPayload() }));
  const session = await h.mod.getServerSession();
  assert.equal(session.sessionKey, "public-session-key");
  assert.equal(session.token, undefined);
  assert.equal(session.user.role, "STUDENT");
  assert.equal(h.calls[0].options.credentials, "same-origin");
  assert.equal(h.calls[0].options.cache, "no-store");

  const malformed = browserSessionHarness(async () => ({ status: 200, ok: true, json: async () => sessionPayload({ user: { id: "x", role: "SUPERADMIN" } }) }));
  assert.equal(await malformed.mod.getServerSession(), null);

  const serverError = browserSessionHarness(async () => ({ status: 500, ok: false, json: async () => ({}) }));
  await assert.rejects(() => serverError.mod.getServerSession(), /unavailable/);
});

test("an absent cookie cannot be restored from a legacy browser token", async () => {
  const h = browserSessionHarness(async (url, options) => {
    if (options.method === "POST") return { status: 200, ok: true, json: async () => sessionPayload() };
    return { status: 401, ok: false, json: async () => ({ success: false }) };
  });
  const session = await h.mod.getServerSession();
  assert.equal(session, null);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.headers, undefined);
});

test("no verified server session yields null rather than trusting browser storage", async () => {
  const h = browserSessionHarness(async () => ({ status: 401, ok: false, json: async () => ({ success: false }) }));
  assert.equal(await h.mod.getServerSession("stale-token"), null);
  const none = browserSessionHarness(async () => ({ status: 401, ok: false, json: async () => ({ success: false }) }));
  assert.equal(await none.mod.getServerSession(), null);
  assert.equal(none.calls.length, 1);
});

test("sign-out posts a marked same-origin revocation and reports network failure", async () => {
  const ok = browserSessionHarness(async () => ({ status: 200, ok: true, json: async () => ({ success: true }) }));
  assert.equal(await ok.mod.endServerSession("session-token"), true);
  assert.equal(ok.calls[0].url, "/api/auth/logout");
  assert.equal(ok.calls[0].options.method, "POST");
  assert.equal(ok.calls[0].options.credentials, "same-origin");
  assert.equal(ok.calls[0].options.cache, "no-store");
  assert.equal(ok.calls[0].options.headers.Authorization, undefined);
  assert.equal(ok.calls[0].options.headers["X-VaultQ-Session"], "session-token");
  assert.equal(ok.calls[0].options.headers["X-VaultQ-Request"], "1");

  const failed = browserSessionHarness(async () => { throw new Error("offline"); });
  assert.equal(await failed.mod.endServerSession("session-token"), false);
});

test("session restoration waits for an in-flight logout and logout calls stay serialized", async () => {
  let release;
  const h = browserSessionHarness(async (url) => {
    if (url === "/api/auth/logout") {
      return new Promise((resolve) => { release = () => resolve({ status: 200, ok: true, json: async () => ({ success: true }) }); });
    }
    return { status: 200, ok: true, json: async () => sessionPayload() };
  });
  const logout = h.mod.endServerSession("old-token");
  const restore = h.mod.getServerSession("old-token");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls.map((call) => call.url), ["/api/auth/logout"]);
  release();
  assert.equal(await logout, true);
  const session = await restore;
  assert.equal(session.sessionKey, "public-session-key");
  assert.deepEqual(h.calls.map((call) => call.url), ["/api/auth/logout", "/api/auth/session"]);

  let releases = [];
  const serialized = browserSessionHarness(async () => new Promise((resolve) => {
    releases.push(() => resolve({ status: 200, ok: true, json: async () => ({ success: true }) }));
  }));
  const first = serialized.mod.endServerSession("first");
  const second = serialized.mod.endServerSession("second");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(serialized.calls.length, 1, "second logout waits for the first");
  releases[0]();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(serialized.calls.length, 2);
  releases[1]();
  await second;
});
