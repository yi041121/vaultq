"use client";

// Robust student-card barcode decoding for uploaded images.
// Real phone photos of cards fail plain file scans, so after the direct
// attempt we preprocess a series of variants and retry until one decodes:
//   - EXIF-oriented bitmap (phones embed rotation in metadata)
//   - grayscale + auto-contrast at two scales
//   - overlapping horizontal strips (barcode small inside a big card photo)
//   - Otsu binarization (dark shots)
//   - 90° / 270° rotations (card photographed vertically)
// Also supports HEIC/HEIF (iPhone camera format) via heic2any pre-conversion.

const TEMP_ID = "vaultq-barcode-decoder-temp";

/** Pull the first 10-digit run out of a decoded barcode string. */
export function extractBarcodeDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const m = digits.match(/[0-9]{10}/);
  return m ? m[0] : null;
}

/** Scan one image blob with html5-qrcode; resolves null when nothing is found. */
async function h5Scan(blob: Blob): Promise<string | null> {
  let el = document.getElementById(TEMP_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TEMP_ID;
    el.style.display = "none";
    document.body.appendChild(el);
  }
  const { Html5Qrcode } = await import("html5-qrcode");
  const scanner = new Html5Qrcode(TEMP_ID);
  try {
    const file = new File([blob], "card.png", { type: blob.type || "image/png" });
    const text = await scanner.scanFile(file, false);
    return text || null;
  } catch {
    return null;
  } finally {
    try { scanner.clear(); } catch {}
  }
}

function firstDigitsFrom(text: string | null): string | null {
  return text ? extractBarcodeDigits(text) : null;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/png"));
}

/** Grayscale + auto-contrast variant of the bitmap, normalized to maxSide. */
async function normalizeBitmap(bitmap: ImageBitmap | HTMLCanvasElement, maxSide: number): Promise<HTMLCanvasElement> {
  const w0 = "width" in bitmap ? bitmap.width : 0;
  const h0 = "height" in bitmap ? bitmap.height : 0;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  // luminance histogram
  const hist = new Uint32Array(256);
  const lum = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
    const l = Math.round(0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]);
    lum[p] = l;
    hist[l]++;
  }
  // Contrast stretch, anchored so that narrow-range photos (screenshots,
  // uniform lighting) don't get crushed to all-black:
  //   wide range:  clip 1% tails and stretch
  //   narrow range: anchor the median midpoint with a ±60 window around it
  const total = w * h;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
  let median = 128;
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total / 2) { median = v; break; } }
  if (hi - lo < 100) {
    lo = Math.max(0, median - 60);
    hi = Math.min(255, median + 60);
    if (hi <= lo) { lo = Math.max(0, median - 70); hi = Math.max(lo + 8, median + 70); }
  }
  const range = hi > lo ? 255 / (hi - lo) : 0;
  for (let i = 0; i < lum.length; i++) {
    const v = range > 0 ? Math.max(0, Math.min(255, Math.round((lum[i] - lo) * range))) : lum[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Otsu-threshold the canvas in place → pure black/white. */
function binarize(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const total = canvas.width * canvas.height;
  const hist = new Uint32Array(256);
  for (let i = 0; i < total; i++) hist[img.data[i * 4]]++;
  // Otsu
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0, wB = 0, best = 0, thr = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += v * hist[v];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; thr = v; }
  }
  for (let i = 0; i < total; i++) {
    const v = img.data[i * 4] <= thr ? 0 : 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

/** Crop a horizontal band of the canvas (0..1 range), scanning candidates when
 * the barcode is tiny inside a large card photo. */
async function scanStrips(canvas: HTMLCanvasElement): Promise<string | null> {
  const bands = [
    { y0: 0.0, y1: 0.4 },
    { y0: 0.3, y1: 0.7 },
    { y0: 0.6, y1: 1.0 },
  ];
  for (const b of bands) {
    const bandH = Math.max(1, Math.round(canvas.height * (b.y1 - b.y0)));
    const bandY = Math.max(0, Math.round(canvas.height * b.y0));
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = bandH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) continue;
    ctx.drawImage(canvas, 0, bandY, canvas.width, bandH, 0, 0, canvas.width, bandH);
    const blob = await canvasToBlob(c);
    if (!blob) continue;
    const code = firstDigitsFrom(await h5Scan(blob));
    if (code) return code;
  }
  return null;
}

function isHeic(file: { type: string; name?: string }): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif" || t === "image/heic-sequence" || t === "image/heif-sequence") return true;
  return !!file.name && /\.(heic|heif)$/i.test(file.name);
}

async function decodeFromBitmap(bitmap: ImageBitmap): Promise<string | null> {
  // Scale 1: 1400px normalized — grayscale + auto-contrast
  const base = await normalizeBitmap(bitmap, 1400);
  const baseBlob = await canvasToBlob(base);
  if (baseBlob) {
    const code = firstDigitsFrom(await h5Scan(baseBlob));
    if (code) return code;

    // strips: barcode tiny inside a big photo — run both raw (contrast intact)
    // and normalized, at near-native resolution because downscaling would
    // shrink the barcode below decodable width
    const full = await normalizeBitmap(bitmap, 2600);
    const stripCode = await scanStrips(full);
    if (stripCode) return stripCode;

    // raw native strips straight from the bitmap (no contrast processing)
    for (const band of [
      { y0: 0.0, y1: 0.4 },
      { y0: 0.3, y1: 0.7 },
      { y0: 0.6, y1: 1.0 },
    ]) {
      const sy = Math.round(bitmap.height * band.y0);
      const sh = Math.max(1, Math.round(bitmap.height * (band.y1 - band.y0)));
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = sh;
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(bitmap, 0, sy, bitmap.width, sh, 0, 0, bitmap.width, sh);
      const blob = await canvasToBlob(c);
      if (!blob) continue;
      const codeRaw = firstDigitsFrom(await h5Scan(blob));
      if (codeRaw) return codeRaw;
    }

    // Otsu binarization for very dark shots
    if (binarize(base)) {
      const binBlob = await canvasToBlob(base);
      if (binBlob) {
        const code2 = firstDigitsFrom(await h5Scan(binBlob));
        if (code2) return code2;
      }
    }
  }

  // Scale 2: smaller 800px normalized (decoders often like downscaled photos)
  const small = await normalizeBitmap(bitmap, 800);
  const smallBlob = await canvasToBlob(small);
  if (smallBlob) {
    const code3 = firstDigitsFrom(await h5Scan(smallBlob));
    if (code3) return code3;
  }

  // Rotations: card photographed vertically (portrait)
  for (const src of [small, base]) {
    for (const deg of [90, 270]) {
      const rotated = document.createElement("canvas");
      rotated.width = src.height;
      rotated.height = src.width;
      const rctx = rotated.getContext("2d", { willReadFrequently: true });
      if (!rctx) continue;
      rctx.translate(rotated.width / 2, rotated.height / 2);
      rctx.rotate((deg * Math.PI) / 180);
      rctx.drawImage(src, -src.width / 2, -src.height / 2);
      const rotBlob = await canvasToBlob(rotated);
      if (!rotBlob) continue;
      const code4 = firstDigitsFrom(await h5Scan(rotBlob));
      if (code4) return code4;
    }
  }
  return null;
}

/**
 * Final fallback: ask the server to decode with zbarimg (handles photos the
 * browser engine cannot read). Returns null when the server is unavailable or
 * also fails — the UI then shows its manual-entry message.
 */
async function serverDecode(blob: Blob): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("file", new File([blob], "card.png", { type: blob.type || "image/png" }));
    const res = await fetch("/api/decode-barcode", { method: "POST", body: form });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const code = data?.data?.barcode;
    return typeof code === "string" ? extractBarcodeDigits(code) : null;
  } catch {
    return null;
  }
}

/**
 * Try to decode a 10-digit barcode from an uploaded card image.
 * Returns the 10 digits, or null when nothing decodable is found.
 */
export async function decodeBarcodeFromImage(file: Blob & { name?: string }): Promise<string | null> {
  let work = file as Blob;

  // iPhone photos arrive as HEIC/HEIF which browsers can't decode — convert once.
  if (isHeic(work as { type: string; name?: string })) {
    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob: work, toType: "image/jpeg" });
      work = Array.isArray(converted) ? converted[0] : converted;
    } catch {
      return null; // conversion failed — caller shows its generic message
    }
  }

  // Pass 1: original image as-is
  const direct = firstDigitsFrom(await h5Scan(work));
  if (direct) return direct;

  // Pass 2+: preprocessed variants (EXIF-orientation aware)
  try {
    const bitmap = await createImageBitmap(work, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const clientResult = await decodeFromBitmap(bitmap);
    if (clientResult) return clientResult;
  } catch {
    // browser couldn't open the image at all — still try the server
  }

  // Pass 3: server-side zbar fallback
  return await serverDecode(work);
}
