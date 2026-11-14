import { timingSafeEqual } from "crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";

export const UNLOCK_MS = 5000;
export const SESSION_SECONDS = 120;
const ISSUER = "vaultq-hardware";
const AUDIENCE = "vaultq-locker";
const SESSION_SECRET = process.env.HARDWARE_SESSION_SECRET;

export interface HardwareDevice { deviceId: string; lockerNumber: string }
interface DeviceConfig extends HardwareDevice { apiKey: string }

function readDevices(): DeviceConfig[] {
  try {
    const input: unknown = JSON.parse(process.env.HARDWARE_DEVICES || "[]");
    if (!Array.isArray(input) || input.length > 256) return [];
    const ids = new Set<string>();
    const keys = new Set<string>();
    const lockers = new Set<string>();
    const devices: DeviceConfig[] = [];
    for (const entry of input) {
      if (!entry || typeof entry !== "object") return [];
      const { deviceId, lockerNumber, apiKey } = entry;
      if (typeof deviceId !== "string" || !/^[A-Za-z0-9_-]{1,96}$/.test(deviceId)
        || typeof lockerNumber !== "string" || !/^[A-Z0-9_-]{1,32}$/.test(lockerNumber)
        || typeof apiKey !== "string" || apiKey.trim() !== apiKey || apiKey.length < 32 || apiKey.length > 256
        || ids.has(deviceId) || keys.has(apiKey) || lockers.has(lockerNumber)) return [];
      ids.add(deviceId); keys.add(apiKey); lockers.add(lockerNumber);
      devices.push({ deviceId, lockerNumber, apiKey });
    }
    return devices;
  } catch { return []; }
}

export function isHardwareConfigured(): boolean {
  return Boolean(SESSION_SECRET && SESSION_SECRET.trim() === SESSION_SECRET && SESSION_SECRET.length >= 32 && readDevices().length);
}

/** Device identity and locker are server-owned; a key cannot select another ID. */
export function authenticateHardwareDevice(deviceId: string, key: string | null): HardwareDevice | null {
  if (!isHardwareConfigured() || !key || key.length > 256) return null;
  const device = readDevices().find(entry => entry.deviceId === deviceId);
  if (!device) return null;
  const given = Buffer.from(key);
  const expected = Buffer.from(device.apiKey);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { deviceId: device.deviceId, lockerNumber: device.lockerNumber };
}

export interface LockerSession { userId: string; deviceId: string; locker: string }

export function createLockerSession(userId: string, device: HardwareDevice): string {
  if (!isHardwareConfigured()) throw new Error("Hardware API is not configured");
  if (!readDevices().some(entry => entry.deviceId === device.deviceId && entry.lockerNumber === device.lockerNumber)) throw new Error("Device is not registered to this locker");
  return jwt.sign(
    { purpose: "locker", userId, deviceId: device.deviceId, locker: device.lockerNumber },
    SESSION_SECRET!,
    { algorithm: "HS256", expiresIn: SESSION_SECONDS, issuer: ISSUER, audience: AUDIENCE },
  );
}

export function readLockerSession(token: string): LockerSession | null {
  if (!isHardwareConfigured() || !token || token.length > 4096) return null;
  try {
    const payload = jwt.verify(token, SESSION_SECRET!, { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE }) as JwtPayload;
    if (payload.purpose !== "locker" || typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || typeof payload.userId !== "string" || !payload.userId
      || typeof payload.deviceId !== "string" || typeof payload.locker !== "string") return null;
    const device = readDevices().find(entry => entry.deviceId === payload.deviceId);
    if (!device || device.lockerNumber !== payload.locker) return null;
    return { userId: payload.userId, deviceId: payload.deviceId, locker: payload.locker };
  } catch { return null; }
}
