import { timingSafeEqual } from "crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";

export const LOCKER_NUMBER = process.env.LOCKER_NUMBER || "B03";
export const UNLOCK_MS = 5000;
export const SESSION_SECONDS = 120;

const DEVICE_KEY = process.env.HARDWARE_API_KEY;
const SESSION_SECRET = process.env.HARDWARE_SESSION_SECRET;

export function isHardwareConfigured(): boolean {
  return Boolean(DEVICE_KEY && SESSION_SECRET);
}

export function isDeviceKeyValid(header: string | null): boolean {
  if (!DEVICE_KEY) return false;
  const given = Buffer.from(header || "");
  const expected = Buffer.from(DEVICE_KEY);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface LockerSession {
  userId: string;
  deviceId: string;
  locker: string;
}

export function createLockerSession(userId: string, deviceId: string): string {
  if (!SESSION_SECRET) throw new Error("HARDWARE_SESSION_SECRET is not configured");
  return jwt.sign(
    { purpose: "locker", userId, deviceId, locker: LOCKER_NUMBER },
    SESSION_SECRET,
    { expiresIn: SESSION_SECONDS },
  );
}

export function readLockerSession(token: string): LockerSession | null {
  if (!SESSION_SECRET || !token) return null;
  try {
    const payload = jwt.verify(token, SESSION_SECRET) as JwtPayload & {
      purpose?: string;
      userId?: string;
      deviceId?: string;
      locker?: string;
    };
    if (payload.purpose !== "locker" || !payload.userId || !payload.deviceId || !payload.locker) {
      return null;
    }
    return { userId: payload.userId, deviceId: payload.deviceId, locker: payload.locker };
  } catch {
    return null;
  }
}
