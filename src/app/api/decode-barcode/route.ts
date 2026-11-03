import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const runtime = "nodejs";

// Server-side barcode fallback. The browser decoder (html5-qrcode/zxing) is
// tried first; this route rescues photos it cannot read by running zbarimg,
// the reference decoder for 1D barcodes. ImageMagick preprocessing is applied
// when available to help low-contrast photos.

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = /^image\/(png|jpe?g|webp|gif|bmp|tiff?)$/i;

function execFileSafe(cmd: string, args: string[], timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

function extractDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const m = digits.match(/[0-9]{10}/);
  return m ? m[0] : null;
}

export async function POST(request: NextRequest) {
  const tempFiles: string[] = [];
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "Image file required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "Image must be under 8MB" }, { status: 413 });
    }
    if (file.type && !ALLOWED_TYPES.test(file.type)) {
      return NextResponse.json({ success: false, error: "Unsupported image type" }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base = path.join(os.tmpdir(), `vaultq-barcode-${crypto.randomUUID()}`);
    const src = `${base}.img`;
    await fs.writeFile(src, buffer);
    tempFiles.push(src);

    // Raw scan first — zbar handles rotated barcodes itself.
    const scan = async (target: string): Promise<string | null> => {
      try {
        const out = await execFileSafe("zbarimg", ["--raw", "-q", target]);
        return extractDigits(out);
      } catch {
        return null;
      }
    };

    let barcode = await scan(src);

    // Preprocessed variants when ImageMagick is available (normalized contrast,
    // plus rotated/flipped frames for stubborn perspective shots).
    if (!barcode) {
      const variants: string[][] = [
        ["-colorspace", "Gray", "-normalize"],
        ["-colorspace", "Gray", "-normalize", "-rotate", "90"],
        ["-colorspace", "Gray", "-normalize", "-rotate", "180"],
        ["-colorspace", "Gray", "-normalize", "-rotate", "270"],
        ["-colorspace", "Gray", "-normalize", "-negate"],
      ];
      const magick = await execFileSafe("which", ["magick"]).then(() => "magick").catch(() => null)
        || await execFileSafe("which", ["convert"]).then(() => "convert").catch(() => null);
      if (magick) {
        for (const args of variants) {
          const out = `${base}-${crypto.randomUUID()}.png`;
          try {
            await execFileSafe(magick, [src, ...args, out]);
            tempFiles.push(out);
            barcode = await scan(out);
            if (barcode) break;
          } catch {
            // variant failed — continue
          }
        }
      }
    }

    if (!barcode) {
      return NextResponse.json({ success: false, error: "No barcode found in the image" }, { status: 422 });
    }
    return NextResponse.json({ success: true, data: { barcode } });
  } catch (e) {
    console.error("Barcode decode failed", e);
    return NextResponse.json({ success: false, error: "Failed to decode barcode" }, { status: 500 });
  } finally {
    await Promise.all(tempFiles.map((f) => fs.unlink(f).catch(() => {})));
  }
}
