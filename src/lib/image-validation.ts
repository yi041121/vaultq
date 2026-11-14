import sharp from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 3;
const MAX_IMAGE_PIXELS = 20_000_000;
const ACCEPTED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export class ImageValidationError extends Error {
  constructor(message: string, public readonly status: 400 | 413 | 415 = 400) {
    super(message);
    this.name = "ImageValidationError";
  }
}

interface ImageOptions {
  maxBytes?: number;
  maxDimension?: number;
  output?: "webp" | "png";
}

function cleanMime(mime: string): string {
  return mime.toLowerCase() === "image/jpg" ? "image/jpeg" : mime.toLowerCase();
}

/** Check magic bytes before invoking a decoder. SVG/XML never reach sharp. */
function rasterMime(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 6 && /^(GIF87a|GIF89a)$/.test(buffer.toString("ascii", 0, 6))) return "image/gif";
  return null;
}

/** Fully decode and re-encode: no original metadata, scripts or trailing bytes survive. */
export async function normalizeImageBuffer(buffer: Buffer, claimedMime: string, options: ImageOptions = {}) {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;
  if (!buffer.length) throw new ImageValidationError("Image is empty");
  if (buffer.length > maxBytes) throw new ImageValidationError(`Each image must be under ${maxBytes / 1024 / 1024}MB`, 413);
  const mime = cleanMime(claimedMime);
  if (!ACCEPTED_MIMES.has(mime) || rasterMime(buffer) !== mime) {
    throw new ImageValidationError("Upload a valid JPG, PNG, WebP or GIF photo. SVG and other document formats are not allowed.", 415);
  }
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning", pages: 1 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new ImageValidationError("Image dimensions are too large");
    }
    const dimension = options.maxDimension ?? 1600;
    const resized = image.rotate().resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true });
    // Lossless output is stable when a report photo is reused in inventory or
    // a claim, preserving source deduplication without repeated JPEG quality loss.
    const output = options.output === "png"
      ? await resized.png().timeout({ seconds: 5 }).toBuffer()
      : await resized.webp({ lossless: true, effort: 3 }).timeout({ seconds: 5 }).toBuffer();
    if (output.length > maxBytes) throw new ImageValidationError("Processed image is too large. Please upload a smaller photo.", 413);
    return { buffer: output, mime: options.output === "png" ? "image/png" : "image/webp" };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError("Image could not be decoded safely. Please upload another photo.");
  }
}

export async function normalizeImageData(source: unknown) {
  if (typeof source !== "string") throw new ImageValidationError("Photos must be image data");
  // Bound the encoded input before allocating a decoded Buffer.
  if (source.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 100) {
    throw new ImageValidationError("Each image must be under 5MB", 413);
  }
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(source);
  if (!match || !match[2] || match[2].length % 4 !== 0) throw new ImageValidationError("Invalid image data");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2]) throw new ImageValidationError("Invalid image encoding");
  return normalizeImageBuffer(bytes, match[1]);
}

export async function normalizeImageSource(source: unknown): Promise<string> {
  const image = await normalizeImageData(source);
  return `data:${image.mime};base64,${image.buffer.toString("base64")}`;
}

export async function normalizeImageFile(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new ImageValidationError("Each image must be under 5MB", 413);
  const image = await normalizeImageBuffer(Buffer.from(await file.arrayBuffer()), file.type);
  return `data:${image.mime};base64,${image.buffer.toString("base64")}`;
}

export async function normalizeImageSources(sources: unknown): Promise<string[]> {
  if (!Array.isArray(sources) || sources.length > MAX_PHOTOS) {
    throw new ImageValidationError("You can upload up to 3 photos");
  }
  const normalized: string[] = [];
  // Process sequentially to avoid decoding three large images simultaneously.
  for (const source of new Set(sources)) normalized.push(await normalizeImageSource(source));
  return [...new Set(normalized)];
}
