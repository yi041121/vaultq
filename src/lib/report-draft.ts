// Text-only report draft kept in tab-scoped sessionStorage. Photos are never
// serialised: File objects cannot be restored safely, so users are told that
// attachments are not saved. Drafts are bound to the current session so a
// different signed-in account never sees someone else's text.
import type { ReportFormType } from "./report-form";

export const REPORT_DRAFT_KEY = "vaultq:report-draft";

export interface ReportDraft {
  owner: string;
  type: ReportFormType;
  itemName: string;
  category: string | null;
  description: string;
  location: string;
  date: string;
  savedAt: number;
}

type DraftFields = Pick<ReportDraft, "itemName" | "category" | "description" | "location" | "date">;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private modes can block storage; the form still works without a draft.
    return null;
  }
}

export function hasDraftContent(draft: DraftFields): boolean {
  return Boolean(
    draft.itemName.trim() ||
    draft.category ||
    draft.description.trim() ||
    draft.location.trim() ||
    draft.date,
  );
}

export function saveReportDraft(draft: Omit<ReportDraft, "savedAt"> & { savedAt?: number }) {
  const store = storage();
  if (!store || !draft.owner || !hasDraftContent(draft)) return;
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
    savedAt: draft.savedAt ?? Date.now(),
  };
  try {
    store.setItem(REPORT_DRAFT_KEY, JSON.stringify(record));
  } catch {
    // Quota/storage failures must never interrupt typing.
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
