// Student ID rules, shared by the profile page, admin forms and APIs.

// Current format, e.g. 25SMR10180 (2-digit year + 3-letter programme + 5 digits)
export const STUDENT_ID_PATTERN = /^\d{2}[A-Z]{3}\d{5}$/;
// Legacy demo/seed format already present in the database, e.g. S12348
const LEGACY_STUDENT_ID_PATTERN = /^[A-Z]\d{5}$/;

export const STUDENT_ID_MAX_LENGTH = 10;
export const STUDENT_ID_ERROR_MESSAGE = "Student ID must match the format 25SMR10180";

export function normalizeStudentId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function isValidStudentId(value: string): boolean {
  const id = normalizeStudentId(value);
  return STUDENT_ID_PATTERN.test(id) || LEGACY_STUDENT_ID_PATTERN.test(id);
}
