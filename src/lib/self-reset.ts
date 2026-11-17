import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Self-service reset verification. A student proves ownership with the email
 * on their account and the barcode printed on their physical student card.
 * The barcode alone is not a secret, so it is never accepted by itself: the
 * email must match, the account must be an active student, and attempts are
 * tightly rate-limited.
 */
export const SELF_RESET_MISMATCH_MESSAGE =
  "Those account details do not match. Check your email and card barcode, or contact the Lost & Found office for help.";

export const SELF_RESET_BARCODE_PATTERN = /^[0-9]{10}$/;

export function normalizeCardBarcode(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison; hashing first keeps the buffers equal in length. */
export function secureEquals(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

export function accountBarcodeMatches(
  account: { cardBarcode: string | null },
  barcode: string,
): boolean {
  return typeof account.cardBarcode === "string" && secureEquals(account.cardBarcode, barcode);
}
