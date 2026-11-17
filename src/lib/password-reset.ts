import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const TOKEN_BYTES = 32;

export function createPasswordResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Only the hash is stored, so a database leak cannot be replayed. */
export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetExpiry(now = Date.now()): Date {
  return new Date(now + PASSWORD_RESET_TTL_MS);
}

export function isPlausibleResetToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(token);
}

export function buildPasswordResetUrl(origin: string, token: string): string {
  const configured = process.env.APP_URL?.trim();
  const base = configured ? new URL(configured).origin : new URL(origin).origin;
  const url = new URL("/reset-password", base);
  url.searchParams.set("token", token);
  return url.toString();
}

export function passwordResetEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.PASSWORD_RESET_FROM?.trim());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

export function passwordResetEmailContent(name: string, resetUrl: string) {
  const safeName = escapeHtml(name.trim() || "there");
  const minutes = Math.round(PASSWORD_RESET_TTL_MS / 60_000);
  return {
    subject: "Reset your VaultQ password",
    text: [
      `Hi ${name.trim() || "there"},`,
      "",
      `Use this link to reset your VaultQ password. It expires in ${minutes} minutes and can only be used once:`,
      resetUrl,
      "",
      "If you did not request a password reset, you can ignore this email.",
    ].join("\n"),
    html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,sans-serif;color:#29486a">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d3dce6;border-radius:16px;padding:28px">
    <h1 style="margin:0 0 12px;font-size:22px;color:#2f5580">Reset your VaultQ password</h1>
    <p style="margin:0 0 16px;line-height:1.6">Hi ${safeName},</p>
    <p style="margin:0 0 20px;line-height:1.6">Use the button below to choose a new password. This link expires in ${minutes} minutes and can only be used once.</p>
    <p style="margin:0 0 22px">
      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#2f5580;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Reset password</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">If you did not request this, you can ignore this email. Your password will not change until the link is used.</p>
  </div>
</body></html>`,
  };
}

/**
 * Sends through Resend when configured. Development falls back to a local
 * console link so the flow can be tested without a provider; production never
 * logs the token and fails closed when email is not configured.
 */
export async function sendPasswordResetEmail(input: { to: string; name: string; resetUrl: string }): Promise<void> {
  if (!passwordResetEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[password-reset] ${input.resetUrl}`);
      return;
    }
    throw new Error("Password reset email is not configured");
  }

  const content = passwordResetEmailContent(input.name, input.resetUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: ["Bearer", process.env.RESEND_API_KEY!.trim()].join(" "),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.PASSWORD_RESET_FROM!.trim(),
      to: [input.to],
      subject: content.subject,
      text: content.text,
      html: content.html,
    }),
  });
  if (!response.ok) throw new Error(`Password reset email delivery failed (${response.status})`);
}
