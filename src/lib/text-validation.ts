// Small text rules shared by the API and client forms.

/**
 * True when the first word is made only of digits, e.g. "123 description".
 * Mixed tokens such as "3M tape" are allowed.
 */
export function startsWithNumber(value: string): boolean {
  return /^\d+(?:\s|$)/.test(value.trim());
}
