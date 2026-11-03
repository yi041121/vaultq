// Shared person-name rules for registration, profile and admin account forms.
// Names may contain letters and single spaces only (no digits or special
// characters) and must be at most 20 characters after whitespace cleanup.

export const NAME_MAX_LENGTH = 20;
export const NAME_REQUIRED_MESSAGE = "Name is required";
export const NAME_LENGTH_ERROR_MESSAGE = `Name must be at most ${NAME_MAX_LENGTH} characters`;
export const NAME_CHARACTER_ERROR_MESSAGE = "Name must contain only letters and spaces";

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Filters typed input so only letters and spaces can ever enter the field. */
export function sanitizePersonNameInput(value: string): string {
  return value.replace(/[^A-Za-z ]/g, "");
}

/** Returns the specific validation error, or null when the name is valid. */
export function getPersonNameError(value: string): string | null {
  const name = normalizePersonName(value);
  if (!name) return NAME_REQUIRED_MESSAGE;
  if (name.length > NAME_MAX_LENGTH) return NAME_LENGTH_ERROR_MESSAGE;
  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name)) return NAME_CHARACTER_ERROR_MESSAGE;
  return null;
}

export function isValidPersonName(value: string): boolean {
  return getPersonNameError(value) === null;
}
