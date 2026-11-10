import crypto from "crypto";

const SECRET = process.env.JWT_SECRET || "vaultq-secret-key-change-in-production";
const IMAGE_URL_TTL_SECONDS = 6 * 60 * 60;

function versionOf(source: string) {
  return crypto.createHash("sha1").update(source).digest("hex").slice(0, 12);
}

export type ImageKind = "item" | "report" | "claim";

/**
 * Builds a signed image URL so plain <img> tags can load private images
 * without putting the app JWT in the URL. The signature covers the record,
 * image index, version and expiry.
 */
export function signedImageUrl(kind: ImageKind, id: string, index: number, source: string) {
  if (!source) return "";
  const version = versionOf(source);
  const exp = Math.floor(Date.now() / 1000) + IMAGE_URL_TTL_SECONDS;
  const payload = `${kind}:${id}:${index}:${version}:${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  return `/api/images/${kind}/${encodeURIComponent(id)}/${index}?v=${version}&exp=${exp}&sig=${sig}`;
}

export function verifyImageSignature(
  kind: string,
  id: string,
  index: number,
  version: string,
  exp: number,
  sig: string,
) {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const payload = `${kind}:${id}:${index}:${version}:${exp}`;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
