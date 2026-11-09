"use client";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_DIMENSION = 1400;
const TARGET_BYTES = 800 * 1024;

export interface CompressedImage {
  file: File;
  preview: string;
  originalSize: number;
  compressedSize: number;
}

interface CompressionOptions {
  maxDimension?: number;
  targetBytes?: number;
}

function isHeic(file: File) {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function toBrowserDecodableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  return Array.isArray(converted) ? converted[0] : converted;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read this image"));
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not compress image"))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

async function decode(blob: Blob): Promise<{ source: ImageBitmap | HTMLImageElement; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch {
      // Safari/older browsers fall back to an <img>.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Resize and re-encode a phone photo before upload. Keeps each image under
 * ~800KB so three claim/report photos stay below Vercel's 4.5MB body limit.
 */
export async function compressImageFile(
  file: File,
  options: CompressionOptions = {},
): Promise<CompressedImage> {
  if (!file.type.startsWith("image/") && !isHeic(file)) {
    throw new Error("Please choose an image file");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Photo is too large. Please choose an image under 25MB.");
  }

  const sourceBlob = await toBrowserDecodableBlob(file);
  const decoded = await decode(sourceBlob);
  try {
    const maxDimension = options.maxDimension ?? MAX_DIMENSION;
    const targetBytes = options.targetBytes ?? TARGET_BYTES;
    const longest = Math.max(decoded.width, decoded.height);
    let scale = Math.min(1, maxDimension / longest);
    let quality = 0.78;
    let output: Blob | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not compress image");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(decoded.source, 0, 0, width, height);

      output = await canvasToBlob(canvas, quality);
      if (output.size <= targetBytes) break;
      quality = Math.max(0.45, quality - 0.1);
      if (output.size > targetBytes * 1.4) scale *= 0.85;
    }

    if (!output) throw new Error("Could not compress image");
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    const compressedFile = new File([output], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      preview: await blobToDataUrl(output),
      originalSize: file.size,
      compressedSize: output.size,
    };
  } finally {
    decoded.cleanup();
  }
}

export async function compressImageFileToDataUrl(
  file: File,
  options: CompressionOptions = {},
): Promise<string> {
  return (await compressImageFile(file, options)).preview;
}
