"use client";

import { uniquePhotos } from "./photo-gallery";

// Photos are compared at a small, fixed size. The same upload can be stored
// with a different JPEG encoding, so byte/string equality is not enough — but
// the decoded pixels are identical.
const SIGNATURE_SIZE = 64;

export interface PhotoPixels {
  source: string;
  pixels: Uint8ClampedArray | null;
}

export function samePhotoPixels(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Keeps the first photo from each exact pixel match. Photos that could not be
 * decoded are always kept so a decode failure never hides an image.
 */
export function dedupePhotoPixels(entries: readonly PhotoPixels[]): string[] {
  const kept: Uint8ClampedArray[] = [];
  const result: string[] = [];

  for (const entry of entries) {
    const pixels = entry.pixels;
    if (!pixels) {
      result.push(entry.source);
      continue;
    }
    if (kept.some((known) => samePhotoPixels(known, pixels))) continue;
    kept.push(pixels);
    result.push(entry.source);
  }

  return result;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load photo"));
    image.src = source;
  });
}

async function readPixels(source: string): Promise<Uint8ClampedArray | null> {
  try {
    const image = await loadImage(source);
    const canvas = document.createElement("canvas");
    canvas.width = SIGNATURE_SIZE;
    canvas.height = SIGNATURE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE);
    return context.getImageData(0, 0, SIGNATURE_SIZE, SIGNATURE_SIZE).data;
  } catch {
    return null;
  }
}

/**
 * Builds the photo list for an item detail view. Lightweight lists send a
 * signed URL while the detail response contains the original image data, so
 * prefer the original and fall back to the list URL only when needed.
 */
export function itemPhotoSources(
  listImage: string | null | undefined,
  detailImage: string | null | undefined,
  reportImages: readonly unknown[],
): string[] {
  return uniquePhotos([detailImage || listImage, ...reportImages]);
}

/**
 * Removes exact-string duplicates first, then visually identical copies such
 * as the same upload stored with a different JPEG encoding.
 */
export async function dedupePhotos(sources: readonly unknown[]): Promise<string[]> {
  const unique = uniquePhotos(sources);
  if (typeof document === "undefined" || unique.length < 2) return unique;

  const entries = await Promise.all(
    unique.map(async (source): Promise<PhotoPixels> => ({
      source,
      pixels: await readPixels(source),
    })),
  );
  return dedupePhotoPixels(entries);
}
