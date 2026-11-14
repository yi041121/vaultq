/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");
const sharp = require("sharp");
const { validation, png } = require("./helpers/image-validation.cjs");
const { ImageValidationError, normalizeImageBuffer, normalizeImageSource, normalizeImageSources, normalizeImageFile } = validation;
const pngBytes = Buffer.from(png.split(",")[1], "base64");
const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const svg = `data:image/svg+xml;base64,${svgBytes.toString("base64")}`;
const disguisedSvg = `data:image/png;base64,${svgBytes.toString("base64")}`;

function load(file, dependencies = {}) {
  dependencies = { "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => null }, ...dependencies };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Buffer, File, URL, Date, console, process: { env: { JWT_SECRET: "test-image-signing-key-only" } },
    require(id) { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; },
  });
  return exports;
}

test("genuine JPEG, PNG, WebP and GIF files are decoded and normalized to raster WebP", async () => {
  for (const format of ["jpeg", "png", "webp", "gif"]) {
    const input = await sharp(pngBytes)[format]().toBuffer();
    const output = await normalizeImageBuffer(input, `image/${format}`);
    const metadata = await sharp(output.buffer).metadata();
    assert.equal(output.mime, "image/webp");
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 12);
    assert.equal(metadata.height, 8);
  }
});

test("normalization removes EXIF and appended script bytes and remains stable when reused", async () => {
  const original = await sharp(pngBytes).jpeg().withMetadata({ exif: { IFD0: { Artist: "Private student information" } } }).toBuffer();
  const uploaded = Buffer.concat([original, Buffer.from("<script>alert(1)</script>")]);
  const source = `data:image/jpeg;base64,${uploaded.toString("base64")}`;
  const normalized = await normalizeImageSource(source);
  const output = Buffer.from(normalized.split(",")[1], "base64");
  assert.equal((await sharp(output).metadata()).exif, undefined);
  assert.equal(output.includes(Buffer.from("<script>")), false);
  assert.equal(await normalizeImageSource(normalized), normalized);
});

test("normalization preserves aspect ratio and bounds dimensions without cropping", async () => {
  const wide = await sharp(pngBytes).resize(2400, 1200).png().toBuffer();
  const output = await normalizeImageBuffer(wide, "image/png");
  const meta = await sharp(output.buffer).metadata();
  assert.equal(meta.width, 1600);
  assert.equal(meta.height, 800);
});

test("SVG, HTML, MIME spoofing, truncated files and external URLs are rejected", async () => {
  for (const source of [svg, disguisedSvg, "data:text/html;base64,PHNjcmlwdD4=", png.replace("image/png", "image/jpeg"), "https://example.test/photo.png", "http://127.0.0.1/private", `data:image/png;base64,${pngBytes.subarray(0, 40).toString("base64")}`]) {
    await assert.rejects(() => normalizeImageSource(source), ImageValidationError);
  }
  await assert.rejects(() => normalizeImageBuffer(Buffer.from("<html>not a photo</html>"), "image/jpeg"), ImageValidationError);
});

test("oversized, empty and non-canonical base64 inputs are rejected", async () => {
  for (const source of [null, {}, "data:image/png;base64,", "data:image/png;base64,AAAA\n", "data:image/png;base64,AAA", `data:image/png;base64,${"A".repeat(7_000_000)}`]) {
    await assert.rejects(() => normalizeImageSource(source), ImageValidationError);
  }
  await assert.rejects(() => normalizeImageBuffer(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"), error => error.status === 413);
  await assert.rejects(() => normalizeImageBuffer(Buffer.alloc(0), "image/png"), ImageValidationError);
  let read = false;
  await assert.rejects(() => normalizeImageFile({ size: 6 * 1024 * 1024, arrayBuffer() { read = true; } }), error => error.status === 413);
  assert.equal(read, false);
});

test("large declared pixel dimensions fail before allocating an unbounded decoded image", async () => {
  const bomb = Buffer.from(pngBytes);
  bomb.writeUInt32BE(100_000, 16);
  bomb.writeUInt32BE(100_000, 20);
  let crc = 0xffffffff;
  for (const byte of bomb.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  bomb.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  await assert.rejects(() => normalizeImageBuffer(bomb, "image/png"), ImageValidationError);
});

test("photo arrays enforce the three-photo limit, reject invalid members and deduplicate", async () => {
  assert.equal((await normalizeImageSources([png, png])).length, 1);
  assert.equal((await normalizeImageSources([])).length, 0);
  for (const sources of [[png, png, png, png], [png, null], [svg], "not-an-array", null]) {
    await assert.rejects(() => normalizeImageSources(sources), ImageValidationError);
  }
});

const signatures = load("src/lib/image-url.ts", {
  crypto: { default: crypto },
  "./auth-secrets": { getImageSigningSecret: () => "test-image-signing-key-only" },
});
function imageRoute(source) {
  let reads = 0;
  const route = load("src/app/api/images/[kind]/[id]/[index]/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/prisma": { prisma: { item: { findUnique: async () => { reads++; return { imageUrl: source }; } } } },
    "@/lib/image-url": signatures,
    "@/lib/image-validation": validation,
    "@/lib/claim-validation": { NO_PHOTO_REASON_MIN_LENGTH: 80 },
  });
  return { route, reads: () => reads, context: { params: Promise.resolve({ kind: "item", id: "item-1", index: "0" }) } };
}

test("signed legacy raster images are sanitized on read with private, non-executable responses", async () => {
  const h = imageRoute(png);
  const response = await h.route.GET({ url: `https://vaultq.example${signatures.signedImageUrl("item", "item-1", 0, png)}` }, h.context);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.match(response.headers.get("content-security-policy"), /sandbox/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format, "webp");
});

test("signed unsafe legacy data and external URLs are blocked rather than served or redirected", async () => {
  for (const source of [svg, disguisedSvg, "https://example.test/photo.svg"]) {
    const h = imageRoute(source);
    const response = await h.route.GET({ url: `https://vaultq.example${signatures.signedImageUrl("item", "item-1", 0, source)}` }, h.context);
    assert.equal(response.status, 415);
    assert.equal(response.headers.get("location"), null);
  }
});

test("missing/expired signatures are rejected before database access; old URLs cannot read replacements", async () => {
  const h = imageRoute(png);
  assert.equal((await h.route.GET({ url: "https://vaultq.example/api/images/item/item-1/0" }, h.context)).status, 403);
  assert.equal(h.reads(), 0);
  const staleUrl = signatures.signedImageUrl("item", "item-1", 0, "old-image-source");
  assert.equal((await h.route.GET({ url: `https://vaultq.example${staleUrl}` }, h.context)).status, 404);
  const expired = new URL(`https://vaultq.example${signatures.signedImageUrl("item", "item-1", 0, png)}`);
  expired.searchParams.set("exp", "1");
  assert.equal((await h.route.GET({ url: expired.href }, h.context)).status, 403);
});

function writeRoute(file, { role = "STUDENT", reportType = "LOST" } = {}) {
  let writes = 0;
  const neverWrite = async () => { writes++; throw new Error("Unsafe image reached a database write"); };
  const prisma = {
      item: { findUnique: async () => ({ id: "item", status: "FOUND", lockerId: null, locker: null }), create: neverWrite },
      report: { findUnique: async () => ({ id: "report", userId: "student", type: reportType, status: "PENDING", itemName: "Bottle", location: "Library", imageUrl: svg, imageUrls: [svg] }), findFirst: async () => null, create: neverWrite, update: neverWrite },
      claim: { findUnique: async () => ({ id: "claim", userId: "student", status: "REJECTED" }), findFirst: async () => null },
      $transaction: neverWrite,
  };
  const route = load(file, {
    "next/server": { NextResponse: Response },
    "@/lib/prisma": { prisma },
    "@/lib/auth": { authenticateRequest: async () => ({ id: "student", role }) },
    "@/lib/image-validation": validation,
    "@/lib/claim-validation": { NO_PHOTO_REASON_MIN_LENGTH: 80 },
    "@/lib/image-url": signatures,
    "@/lib/photo-gallery": load("src/lib/photo-gallery.ts"),
    "@/lib/categories": { isItemCategory: () => true },
    "@/lib/notification-service": { notifyUser: neverWrite, notifyUsers: neverWrite },
    "@/lib/match-notification-service": { notifyInventoryMatches: neverWrite },
    "@/lib/report-include": { REPORT_INCLUDE: {} },
    "@/lib/report-validation": { VALID_REPORT_TYPES: ["LOST", "FOUND"], validateReportDetails: () => ({ ok: true, value: {} }) },
    "@/lib/text-validation": { startsWithNumber: () => false },
    "@/lib/item-service": { createItemRecord: neverWrite },
    "@/lib/claim-transition-service": { ClaimTransitionError: class extends Error {}, resubmitRejectedClaim: neverWrite },
    "@/lib/claim-review-service": load("src/lib/claim-review-service.ts", { "./prisma": { prisma }, "./image-validation": validation, "./report-include": { REPORT_INCLUDE: {} }, "node:crypto": crypto }),
  });
  return { route, writes: () => writes, context: { params: Promise.resolve({ id: "record" }) } };
}

test("JSON upload entry points reject disguised SVG before any database write", async () => {
  for (const [file, method, role, body] of [
    ["src/app/api/reports/route.ts", "POST", "STUDENT", { type: "LOST", imageUrls: [disguisedSvg] }],
    ["src/app/api/reports/[id]/route.ts", "PATCH", "STUDENT", { imageUrls: [disguisedSvg] }],
    ["src/app/api/reports/[id]/route.ts", "PATCH", "ADMIN", { action: "update", imageUrls: [disguisedSvg] }],
    ["src/app/api/claims/route.ts", "POST", "STUDENT", { itemId: "item", claimReason: "Mine", evidenceImageUrls: [disguisedSvg] }],
    ["src/app/api/items/route.ts", "POST", "ADMIN", { itemName: "Bottle", foundLocation: "Library", imageUrl: disguisedSvg }],
    ["src/app/api/items/[id]/route.ts", "PATCH", "ADMIN", { imageUrl: disguisedSvg }],
  ]) {
    const h = writeRoute(file, { role });
    const response = await h.route[method]({ headers: { get: () => "application/json" }, json: async () => body }, h.context);
    assert.equal(response.status, 415, `${file}: ${JSON.stringify(await response.json())}`);
    assert.equal(h.writes(), 0);
  }
});

test("claim resubmission rejects unsafe retained photos before writing", async () => {
  const h = writeRoute("src/app/api/claims/[id]/resubmit/route.ts");
  const form = new FormData(); form.set("claimReason", "Mine"); form.set("keepImages", JSON.stringify([disguisedSvg]));
  assert.equal((await h.route.POST({ formData: async () => form }, h.context)).status, 415);
  assert.equal(h.writes(), 0);
});

test("multipart report and claim uploads cannot bypass byte validation with a forged MIME", async () => {
  for (const file of ["src/app/api/reports/route.ts", "src/app/api/claims/route.ts"]) {
    const h = writeRoute(file);
    const form = new FormData();
    form.set("type", "LOST"); form.set("itemId", "item"); form.set("claimReason", "Mine");
    form.set(file.includes("claims") ? "evidence" : "photos", new File([svgBytes], "safe.png", { type: "image/png" }));
    assert.equal((await h.route.POST({ headers: { get: () => "multipart/form-data" }, formData: async () => form })).status, 415);
    assert.equal(h.writes(), 0);
  }
});

test("found verification and admin matching reject unsafe inherited report photos", async () => {
  for (const [file, reportType, body] of [
    ["src/app/api/reports/[id]/verify/route.ts", "FOUND", { create: {} }],
    ["src/app/api/claims/match/route.ts", "LOST", { reportId: "report", itemId: "item" }],
  ]) {
    const h = writeRoute(file, { role: "ADMIN", reportType });
    const result = await h.route.POST({ json: async () => body }, h.context);
    assert.equal(result.status, 415);
    assert.equal(h.writes(), 0);
  }
});

test("valid report create/edit, inventory create/edit and claim resubmission store sanitized photos", async () => {
  const expected = await normalizeImageSource(png);
  for (const kind of ["report-create", "report-edit", "item-create", "item-edit", "resubmit"]) {
    const saved = [];
    const save = async ({ data }) => { saved.push(data); return { id: "record", ...data }; };
    const transaction = {
      claim: { update: save }, report: { updateMany: async args => { await save(args); return { count: 1 }; }, findUniqueOrThrow: async () => ({ id: "report" }) },
      item: { updateMany: async args => { await save(args); return { count: 1 }; }, findUnique: async () => ({ id: "item" }) },
    };
    const files = {
      "report-create": "src/app/api/reports/route.ts", "report-edit": "src/app/api/reports/[id]/route.ts",
      "item-create": "src/app/api/items/route.ts", "item-edit": "src/app/api/items/[id]/route.ts",
      resubmit: "src/app/api/claims/[id]/resubmit/route.ts",
    };
    const route = load(files[kind], {
      "next/server": { NextResponse: Response },
      "@/lib/prisma": { prisma: {
        report: { findUnique: async () => ({ id: "report", type: "LOST", status: "PENDING", userId: "student" }), findFirst: async () => null, create: save, update: save },
        item: { findUnique: async () => ({ id: "item", status: "FOUND" }) },
        claim: { findUnique: async () => ({ id: "claim", userId: "student", status: "REJECTED" }) },
        $transaction: async (fn) => fn(transaction),
      } },
      "@/lib/auth": { authenticateRequest: async () => ({ id: "student", role: kind.startsWith("item") ? "ADMIN" : "STUDENT" }) },
      "@/lib/image-validation": validation,
    "@/lib/claim-validation": { NO_PHOTO_REASON_MIN_LENGTH: 80 }, "@/lib/image-url": signatures,
      "@/lib/photo-gallery": load("src/lib/photo-gallery.ts"), "@/lib/categories": { isItemCategory: () => true },
      "@/lib/notification-service": { notifyUser: async () => {} }, "@/lib/match-notification-service": { notifyInventoryMatches: async () => {} },
      "@/lib/report-include": { REPORT_INCLUDE: {} }, "@/lib/text-validation": { startsWithNumber: () => false },
      "@/lib/report-validation": { VALID_REPORT_TYPES: ["LOST", "FOUND"], validateReportDetails: () => ({ ok: true, value: { itemName: "Bottle" } }) },
      "@/lib/item-service": { createItemRecord: async (_tx, _admin, data) => save({ data }) },
      "@/lib/claim-transition-service": {
        ClaimTransitionError: class extends Error {},
        resubmitRejectedClaim: async (_id, _owner, data) => save({ data: { ...data, evidenceImageUrl: data.evidenceImageUrls[0] } }),
      },
      "@/lib/claim-review-service": { ClaimReviewError: class extends Error {}, isReviewWriteConflict: () => false },
    });
    const form = new FormData(); form.set("claimReason", "Mine"); form.set("keepImages", JSON.stringify([png]));
    const request = {
      headers: { get: () => "application/json" }, formData: async () => form,
      json: async () => ({ type: "LOST", itemName: "Bottle", foundLocation: "Library", imageUrl: png, imageUrls: [png] }),
    };
    const response = await route[kind.endsWith("edit") ? "PATCH" : "POST"](request, { params: Promise.resolve({ id: "record" }) });
    assert.ok(response.ok, `${kind}: ${JSON.stringify(await response.json())}`);
    assert.equal(saved.length, 1);
    if (kind === "resubmit") assert.equal(saved[0].evidenceImageUrl, expected);
    else assert.equal(saved[0].imageUrl, expected);
  }
});

test("barcode fallback rejects executable bytes before invoking external decoders or writing files", async () => {
  let invoked = false;
  const never = () => { invoked = true; throw new Error("Unsafe image reached decoder"); };
  const route = load("src/app/api/decode-barcode/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/image-validation": validation,
    "node:child_process": { execFile: never }, "node:fs": { promises: { writeFile: never } },
    "node:os": { default: require("node:os") }, "node:path": { default: path }, "node:crypto": { default: crypto },
    "@/lib/auth-rate-limit": { enforceAuthRateLimit: async () => null },
  });
  const form = new FormData(); form.set("file", new File([svgBytes], "photo.png", { type: "image/png" }));
  assert.equal((await route.POST({ formData: async () => form })).status, 415);
  assert.equal(invoked, false);
});
