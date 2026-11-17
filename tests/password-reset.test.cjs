/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadResetModule() {
  const source = read("src/lib/password-reset.ts");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  const context = { exports, require: (id) => require(id), process, console, fetch: (...args) => global.fetch(...args), URL, Date, Math };
  vm.runInNewContext(code, context);
  return exports;
}

const reset = loadResetModule();
const env = { ...process.env };

test("reset tokens are random, URL-safe, hashed at rest and expire after 30 minutes", () => {
  const first = reset.createPasswordResetToken();
  const second = reset.createPasswordResetToken();
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first, second);
  assert.match(reset.hashPasswordResetToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(reset.hashPasswordResetToken(first), reset.hashPasswordResetToken(second));
  const now = Date.UTC(2026, 10, 17, 12, 0, 0);
  assert.equal(reset.passwordResetExpiry(now).getTime(), now + 30 * 60 * 1000);
  assert.equal(reset.isPlausibleResetToken(first), true);
  assert.equal(reset.isPlausibleResetToken("short"), false);
  assert.equal(reset.isPlausibleResetToken("<script>"), false);
});

test("reset links use the canonical APP_URL when configured", () => {
  process.env.APP_URL = "https://vaultq.example.edu";
  assert.equal(
    reset.buildPasswordResetUrl("http://localhost:3000", "abc_DEF-1234567890"),
    "https://vaultq.example.edu/reset-password?token=abc_DEF-1234567890",
  );
  delete process.env.APP_URL;
  assert.equal(
    reset.buildPasswordResetUrl("https://vaultq-fawn.vercel.app", "abc_DEF-1234567890"),
    "https://vaultq-fawn.vercel.app/reset-password?token=abc_DEF-1234567890",
  );
});

test("email content includes the one-time link, expiry and escaped greeting", () => {
  const resetUrl = "https://vaultq.example.edu/reset-password?token=abc_DEF-1234567890";
  const content = reset.passwordResetEmailContent("<Alex & Co>", resetUrl);
  assert.equal(content.subject, "Reset your VaultQ password");
  assert.match(content.text, /expires in 30 minutes/i);
  assert.match(content.text, new RegExp(resetUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(content.html, /Hi &lt;Alex &amp; Co&gt;/);
  assert.match(content.html, /Reset password/);
});

test("development logs the reset link; production fails closed without provider config", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.PASSWORD_RESET_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.PASSWORD_RESET_FROM;

  process.env.NODE_ENV = "development";
  const lines = [];
  const originalInfo = console.info;
  console.info = (line) => lines.push(String(line));
  try {
    await reset.sendPasswordResetEmail({ to: "student@example.test", name: "Student", resetUrl: "https://example.test/reset?token=abc" });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /https:\/\/example\.test\/reset\?token=abc/);
  } finally {
    console.info = originalInfo;
  }

  process.env.NODE_ENV = "production";
  await assert.rejects(
    reset.sendPasswordResetEmail({ to: "student@example.test", name: "Student", resetUrl: "https://example.test/reset?token=abc" }),
    /not configured/,
  );

  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previousKey;
  if (previousFrom === undefined) delete process.env.PASSWORD_RESET_FROM;
  else process.env.PASSWORD_RESET_FROM = previousFrom;
});

test("Resend delivery sends the reset link without exposing the token locally", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.PASSWORD_RESET_FROM = "VaultQ <no-reply@example.test>";
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200 };
  };
  try {
    await reset.sendPasswordResetEmail({
      to: "student@example.test", name: "Student",
      resetUrl: "https://vaultq.example.edu/reset-password?token=secret-token",
    });
  } finally {
    global.fetch = originalFetch;
    if (env.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = env.RESEND_API_KEY;
    if (env.PASSWORD_RESET_FROM === undefined) delete process.env.PASSWORD_RESET_FROM;
    else process.env.PASSWORD_RESET_FROM = env.PASSWORD_RESET_FROM;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.match(calls[0].options.headers.Authorization, /^Bearer /);
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.to, ["student@example.test"]);
  assert.match(body.html, /reset-password\?token=secret-token/);
});

test("forgot-password never reveals whether an account exists", () => {
  const route = read("src/app/api/auth/forgot-password/route.ts");
  assert.match(route, /If an account exists for that email/);
  assert.match(route, /enforceAuthRateLimit\(request, "passwordReset", email\)/);
  assert.match(route, /passwordResetEmailConfigured\(\)/);
  assert.match(route, /deleteMany\(\{ where: \{ userId: user\.id \} \}\)/);
  assert.match(route, /hashPasswordResetToken\(token\)/);
  assert.doesNotMatch(route, /token:\s*token|resetUrl\s*[,}]/, "the token is never returned to the browser");
});

test("reset-password consumes the token once, updates the hash and revokes sessions", () => {
  const route = read("src/app/api/auth/reset-password/route.ts");
  assert.match(route, /isPlausibleResetToken\(token\)/);
  assert.match(route, /hashPassword\(password\)/);
  assert.match(route, /usedAt: null, expiresAt: \{ gt: new Date\(\) \}/);
  assert.match(route, /if \(claimed\.count !== 1\) throw new InvalidResetTokenError\(\)/);
  assert.match(route, /tx\.authSession\.deleteMany\(\{ where: \{ userId: record\.userId \} \}\)/);
  assert.match(route, /clearSessionCookies\(response\)/);
  assert.match(route, /Cache-Control": "no-store/);
});

test("forgot and reset pages are wired to the auth APIs", () => {
  const forgot = read("src/app/(auth)/forgot-password/page.tsx");
  const resetPage = read("src/app/(auth)/reset-password/page.tsx");
  const login = read("src/app/(auth)/login/page.tsx");
  assert.match(login, /href="\/forgot-password"/);
  assert.match(forgot, /\/api\/auth\/forgot-password/);
  assert.match(forgot, /Check your email/);
  assert.match(resetPage, /\/api\/auth\/reset-password\?token=/);
  assert.match(resetPage, /Passwords do not match/);
  assert.match(resetPage, /Password updated/);
});
