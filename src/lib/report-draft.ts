// Report drafts are kept in tab-scoped sessionStorage and bound to the current
// session so a different signed-in account never sees someone else's draft.
// Photos are stored as compressed JPEG data URLs so "Continue draft" can
// restore the exact images the student had attached. Raw File objects are
// never serialised.
import type { ReportFormType } from "./report-form";

export const REPORT_DRAFT_KEY = "vaultq:report-draft";
const MAX_DRAFT_PHOTOS = 3;

export interface ReportDraftPhoto {
  /** Compressed JPEG data URL used for the preview and to rebuild the File. */
  preview: string;
  name: string;
  type: string;
}

export interface ReportDraft {
  owner: string;
  type: ReportFormType;
  itemName: string;
  category: string | null;
  description: string;
  location: string;
  date: string;
  photos: ReportDraftPhoto[];
  savedAt: number;
}

type DraftFields = Pick<ReportDraft, "itemName" | "category" | "description" | "location" | "date">;
type DraftContent = DraftFields & { photos?: readonly unknown[] };
type SaveDraftInput = Omit<ReportDraft, "savedAt" | "photos"> & {
  savedAt?: number;
  photos?: readonly unknown[];
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private modes can block storage; the form still works without a draft.
    return null;
  }
}

function isDraftPhoto(value: unknown): value is ReportDraftPhoto {
  if (!value || typeof value !== "object") return false;
  const photo = value as Record<string, unknown>;
  return (
    typeof photo.preview === "string" &&
    photo.preview.startsWith("data:image/") &&
    typeof photo.name === "string" &&
    typeof photo.type === "string"
  );
}

function cleanPhotos(photos: readonly unknown[] | undefined): ReportDraftPhoto[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .filter(isDraftPhoto)
    .slice(0, MAX_DRAFT_PHOTOS)
    .map((photo) => ({
      preview: photo.preview,
      name: photo.name.slice(0, 200),
      type: photo.type.slice(0, 100),
    }));
}

export function hasDraftContent(draft: DraftContent): boolean {
  return Boolean(
    draft.itemName.trim() ||
    draft.category ||
    draft.description.trim() ||
    draft.location.trim() ||
    draft.date ||
    (draft.photos?.length ?? 0) > 0,
  );
}

/** Returns false when storage is unavailable or the draft could not be saved. */
export function saveReportDraft(draft: SaveDraftInput): boolean {
  const store = storage();
  const photos = cleanPhotos(draft.photos);
  if (!store || !draft.owner || !hasDraftContent({ ...draft, photos })) return false;
  // Persist an explicit allowlist so a File, token or other accidental field
  // can never be serialised into web storage.
  const record: ReportDraft = {
    owner: draft.owner,
    type: draft.type,
    itemName: draft.itemName,
    category: draft.category,
    description: draft.description,
    location: draft.location,
    date: draft.date,
    photos,
    savedAt: draft.savedAt ?? Date.now(),
  };
  try {
    store.setItem(REPORT_DRAFT_KEY, JSON.stringify(record));
    return true;
  } catch {
    // Quota/storage failures must never interrupt typing.
    return false;
  }
}

export function loadReportDraft(owner: string | null): ReportDraft | null {
  const store = storage();
  if (!store || !owner) return null;
  try {
    const raw = store.getItem(REPORT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReportDraft>;
    if (
      parsed.owner !== owner ||
      (parsed.type !== "LOST" && parsed.type !== "FOUND") ||
      typeof parsed.itemName !== "string" ||
      (parsed.category !== null && typeof parsed.category !== "string") ||
      typeof parsed.description !== "string" ||
      typeof parsed.location !== "string" ||
      typeof parsed.date !== "string"
    ) {
      return null;
    }
    return {
      owner: parsed.owner,
      type: parsed.type,
      itemName: parsed.itemName,
      category: parsed.category ?? null,
      description: parsed.description,
      location: parsed.location,
      date: parsed.date,
      photos: cleanPhotos(parsed.photos),
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearReportDraft() {
  const store = storage();
  try {
    store?.removeItem(REPORT_DRAFT_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
