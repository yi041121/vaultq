/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadClaimsRoute() {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/api/claims/route.ts"), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    FormData,
    File,
    URL,
    Date,
    console,
    require(name) {
      const dependencies = {
        "next/server": {
          NextResponse: {
            json: (body, init) => ({ body, status: init?.status || 200 }),
          },
        },
        "@/lib/prisma": {
          prisma: {
            item: { findUnique: async () => null },
            claim: {},
            notification: {},
          },
        },
        "@/lib/auth": { authenticateRequest: async () => ({ id: "student", role: "STUDENT" }) },
        "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => null },
        "@/lib/image-url": { signedImageUrl: () => "" },
        "@/lib/photo-gallery": { uniquePhotos: (values) => values },
        "@/lib/image-validation": {
          ImageValidationError: class ImageValidationError extends Error {},
          normalizeImageFile: async () => "safe-image",
          normalizeImageSources: async () => [],
        },
        "@/lib/claim-validation": { NO_PHOTO_REASON_MIN_LENGTH: 80 },
      };
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const jsonRequest = (body) => ({
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
  json: async () => body,
});

test("a claim without photos is rejected unless the no-photo exception is requested", async () => {
  const route = loadClaimsRoute();
  const response = await route.POST(jsonRequest({
    itemId: "item-1",
    claimReason: "x".repeat(80),
  }));
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Photo evidence is required/);
});

test("the no-photo exception requires a detailed ownership explanation", async () => {
  const route = loadClaimsRoute();
  const response = await route.POST(jsonRequest({
    itemId: "item-1",
    claimReason: "It is mine.",
    noPhoto: true,
  }));
  assert.equal(response.status, 400);
  assert.match(response.body.error, /at least 80 characters/);
});

test("a detailed no-photo claim passes validation and reaches item lookup", async () => {
  const route = loadClaimsRoute();
  const response = await route.POST(jsonRequest({
    itemId: "item-1",
    claimReason: "Black Adidas backpack with a broken left strap, a silver keyring, and a name tag inside the front pocket.",
    noPhoto: true,
  }));
  // The stubbed item lookup returns null, proving the photo rule accepted it.
  assert.equal(response.status, 404);
  assert.match(response.body.error, /Item not found/);
});
