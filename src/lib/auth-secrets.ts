import { createHmac } from "node:crypto";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() !== secret || secret.length < 32 || secret === "vaultq-secret-key-change-in-production") {
    throw new Error("JWT_SECRET must be configured with a strong, unique secret of at least 32 characters");
  }
  return secret;
}

export function getImageSigningSecret(): string {
  const explicit = process.env.IMAGE_SIGNING_SECRET;
  if (explicit !== undefined) {
    if (explicit.trim() !== explicit || explicit.length < 32) throw new Error("IMAGE_SIGNING_SECRET must have at least 32 characters");
    return explicit;
  }
  // Domain separation: image signatures do not use the JWT key directly.
  return createHmac("sha256", getJwtSecret()).update("vaultq:image-signing:v1").digest("hex");
}
