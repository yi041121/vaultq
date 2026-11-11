/** Deduplicate stored sources before signing: one image can have several URLs. */
export function uniquePhotos(sources: readonly unknown[]): string[] {
  return Array.from(new Set(sources.filter(
    (source): source is string => typeof source === "string" && source.length > 0,
  )));
}
