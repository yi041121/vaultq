/**
 * Database calls can fail once when a serverless instance hands out a socket
 * that Neon closed during autosuspend, or while Neon is waking up. These are
 * safe to retry for idempotent reads.
 */
const TRANSIENT_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a connection from the pool
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
]);

const TRANSIENT_MESSAGES = [
  "connection terminated",
  "connection closed",
  "connection timeout",
  "timeout exceeded when trying to connect",
  "server has closed the connection",
  "can't reach database server",
];

export function isTransientDbError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const details = error as { code?: unknown; message?: unknown; cause?: { code?: unknown } };
  const codes = [details.code, details.cause?.code].filter((code): code is string => typeof code === "string");
  if (codes.some((code) => TRANSIENT_CODES.has(code))) return true;
  const message = typeof details.message === "string" ? details.message.toLowerCase() : "";
  return TRANSIENT_MESSAGES.some((fragment) => message.includes(fragment));
}

const RETRY_DELAYS_MS = [200, 500];

/** Retries a read-only database operation after a transient connection error. */
export async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === RETRY_DELAYS_MS.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}
