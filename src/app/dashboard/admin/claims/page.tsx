"use client";
import { formatDisplayDate as fmtDateValue } from "@/lib/date-format";
import { activeLinkedReportIds } from "@/lib/claim-report-link";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Grid3X3, Lock, FileText, Users, Search,
  CheckCircle2, XCircle, Eye, RotateCcw, Camera, X, PackageSearch, Sparkles,
  ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Loader2,
} from "lucide-react";
import { showCenteredMessage } from "@/components/centered-message";
import { useEscapeKey } from "@/lib/use-escape-key";
import { matchesSearch, dateSearchValues } from "@/lib/search";
import { StudentShell } from "@/components/student-shell";
import { FilterPanel, ResetFiltersButton } from "@/components/filter-panel";
import { EvidenceSlider } from "@/components/evidence-slider";
import { DescriptionBox } from "@/components/description-box";
import { uniquePhotos } from "@/lib/photo-gallery";
import { dedupePhotos, itemPhotoSources } from "@/lib/photo-dedupe";
import { fetchAdminData, invalidateAdminData, registerAdminCacheReset } from "@/lib/admin-data";
import { AdminListSkeleton } from "@/components/admin-list-skeleton";
import { PhotoViewerModal } from "@/components/photo-viewer-modal";
import { ItemDetailsModal } from "@/components/item-details-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { suggestMatches, suggestionLabel } from "@/lib/report-match";
import { categoryIcon } from "@/lib/category-icons";
import { clearClientSession } from "@/lib/idle-session";
import {
  VCard, VContentPanel, VBadge, VButton, VInput, VTextarea, VSearchInput, VPaginationFooter,
  VDropdown, VDropdownItem, VFilterButton, vcolors as c,
} from "@/components/ui/vault";

const adminNav = [
  { label: "Dashboard", icon: Grid3X3, path: "/dashboard/admin" },
  { label: "Items", icon: Package, path: "/dashboard/admin/items" },
  { label: "Claims", icon: FileText, path: "/dashboard/admin/claims" },
  { label: "Intake", icon: PackageSearch, path: "/dashboard/admin/reports" },
  { label: "Lockers", icon: Lock, path: "/dashboard/admin/lockers" },
  { label: "Accounts", icon: Users, path: "/dashboard/admin/accounts" },
];

type Claim = {
  id: string;
  itemId: string;
  itemName: string;
  category: string;
  student: string;
  studentId: string;
  studentEmail?: string;
  location: string;
  date: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  locker?: string;
  evidencePreview?: string | null;
  evidenceImageUrls?: string[];
  itemImageUrl?: string | null;
  itemImageUrls?: string[];
  itemDescription?: string;
  itemStatus?: string;
  itemFoundDate?: string;
  itemCreatedAt?: string;
  source?: "STUDENT" | "MATCH";
  matchedReportId?: string | null;
  adminNote?: string | null;
  matchedReportDescription?: string | null;
  evidenceUploadedAt?: string;
  createdAt?: string;
  approvedAt?: string | null;
};

type LostReport = {
  id: string;
  itemName: string;
  category: string;
  description: string;
  location: string;
  date: string;
  status: string;
  images: string[];
  student: string;
  studentId: string;
  studentEmail?: string;
  createdAt?: string;
  reviewedAt?: string | null;
};


function fmtClockValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
}

function VerificationCardFooter({ submittedAt, reviewLabel, reviewedAt, children }: {
  submittedAt?: string;
  reviewLabel?: string;
  reviewedAt?: string | null;
  children?: ReactNode;
}) {
  const timestamp = reviewLabel ? reviewedAt : submittedAt;
  const dateTime = timestamp ? [fmtDateValue(timestamp), fmtClockValue(timestamp)].filter(Boolean).join(" · ") : "";
  return (
    <div className="mt-auto" data-verification-footer>
      <div className="min-h-[84px] px-4 py-3 border-t flex flex-wrap content-center items-center gap-2" style={{ borderColor: c.borderLight, backgroundColor: c.fill }}>
        <div className="flex-1 min-w-[130px] text-[10px] leading-relaxed" style={{ color: c.textMuted }}>
          <p className="vq-date [overflow-wrap:anywhere]">{[reviewLabel, dateTime].filter(Boolean).join(" · ") || "Date unavailable"}</p>
        </div>
        {children && <div className="ml-auto flex shrink-0 items-center gap-1.5">{children}</div>}
      </div>
    </div>
  );
}

const statusOptions = ["All", "PENDING", "APPROVED", "REJECTED"] as const;

const CLAIM_REJECT_REASONS = [
  "Evidence doesn't match",
  "Item already claimed",
  "Insufficient proof",
  "Owner could not verify",
];
const LOST_REJECT_REASONS = [
  "Item not found",
  "Duplicate report",
  "Incorrect details",
  "Reported by mistake",
];

type VerificationRow = {
  kind: "CLAIM" | "LOST";
  id: string;
  itemName: string;
  category: string;
  student: string;
  studentEmail: string;
  studentId: string;
  location: string;
  date: string;
  status: string;
  searchFields: string[];
  claim?: Claim;
  report?: LostReport;
};

function statusColor(s: string) {
  switch (s) {
    case "PENDING": return "#64748b";
    case "APPROVED": return "#16a34a";
    case "REJECTED": return "#dc2626";
    case "MATCHED": return "#7FB8B5";
    case "CLOSED": return "#355C8A";
    default: return "#64748b";
  }
}

function reportStatusLabel(s: string) {
  switch (s) {
    case "PENDING": return "Pending";
    case "MATCHED": return "Matched";
    case "APPROVED": return "Approved";
    case "VERIFIED": return "Verified";
    case "REJECTED": return "Rejected";
    case "CLOSED": return "Closed";
    default: return s;
  }
}

type FoundItem = {
  id: string;
  itemName: string;
  category: string | null;
  description: string | null;
  foundLocation: string | null;
  foundDate: string | null;
  imageUrl: string | null;
  locker: { lockerNumber: string } | null;
};

type MatchPreview = { item: FoundItem; images: string[]; index: number };

let claimsCache: Claim[] | null = null;
registerAdminCacheReset(() => { claimsCache = null; lostReportsCache = null; });
let lostReportsCache: LostReport[] | null = null;

export default function AdminClaims() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [claims, setClaims] = useState<Claim[]>(claimsCache ?? []);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<typeof statusOptions[number]>("PENDING");
  const [kindFilter, setKindFilter] = useState<"ALL" | "CLAIM" | "LOST">("ALL");
  const [kindOpen, setKindOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  useEscapeKey(kindOpen, () => setKindOpen(false));
  useEscapeKey(statusOpen, () => setStatusOpen(false));
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [compareClaim, setCompareClaim] = useState<Claim | null>(null);
  const [itemFilter, setItemFilter] = useState<{ id: string; name: string } | null>(null);
  const [claimItemDetail, setClaimItemDetail] = useState<Claim | null>(null);
  const [photoIndices, setPhotoIndices] = useState<Record<string, number>>({});
  const [detailPhotoIndex, setDetailPhotoIndex] = useState(0);
  const [lostLoaded, setLostLoaded] = useState(lostReportsCache !== null);
  const [matchTarget, setMatchTarget] = useState<LostReport | null>(null);
  const [foundItems, setFoundItems] = useState<FoundItem[]>([]);
  const [matchQuery, setMatchQuery] = useState("");
  const [showMatchSearch, setShowMatchSearch] = useState(false);
  const [matchPreview, setMatchPreview] = useState<MatchPreview | null>(null);
  const [confirmMatchItem, setConfirmMatchItem] = useState<FoundItem | null>(null);
  const [matching, setMatching] = useState(false);
  const [lostReports, setLostReports] = useState<LostReport[]>(lostReportsCache ?? []);
  const [photoViewer, setPhotoViewer] = useState<{ photos: string[]; index: number; title: string } | null>(null);
  const [lostDetail, setLostDetail] = useState<LostReport | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ kind: "CLAIM" | "LOST"; id: string; itemName: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [approveTarget, setApproveTarget] = useState<{ id: string; itemName: string } | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [approving, setApproving] = useState(false);
  const [loading, setLoading] = useState(claimsCache === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pageSize = 8;

  function authHeaders(): Record<string, string> {
    const t = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function redirectUnauthorized() {
    clearClientSession();
    router.replace("/login?skip=1&expired=1");
  }

  function mapApiClaim(raw: any): Claim {
    return {
      id: raw.id,
      itemId: raw.itemId,
      itemName: raw.item?.itemName || "Unknown item",
      category: raw.item?.category || "Others",
      student: raw.user?.name || "Unknown",
      studentId: raw.user?.studentId || "—",
      studentEmail: raw.user?.email || "",
      location: raw.item?.foundLocation || "",
      date: String(raw.createdAt || "").slice(0, 10),
      status: raw.status,
      reason: raw.claimReason || "",
      locker: raw.item?.locker?.lockerNumber,
      evidencePreview: raw.evidenceImageUrl || null,
      evidenceImageUrls: Array.isArray(raw.evidenceImageUrls) ? raw.evidenceImageUrls : raw.evidenceImageUrl ? [raw.evidenceImageUrl] : [],
      itemImageUrl: raw.item?.imageUrl || null,
      itemImageUrls: uniquePhotos(Array.isArray(raw.item?.imageUrls)
        ? raw.item.imageUrls
        : [raw.item?.imageUrl, ...(raw.item?.reports?.[0]?.imageUrls || [])]),
      itemDescription: raw.item?.description || "",
      itemStatus: raw.item?.status || "FOUND",
      itemFoundDate: raw.item?.foundDate ? String(raw.item.foundDate).slice(0, 10) : "",
      itemCreatedAt: raw.item?.createdAt ? String(raw.item.createdAt) : "",
      source: raw.source === "MATCH" ? "MATCH" : "STUDENT",
      matchedReportId: raw.matchedReportId || null,
      adminNote: raw.adminNote || null,
      matchedReportDescription: raw.matchedReportDescription || null,
      evidenceUploadedAt: raw.evidenceUploadedAt ? String(raw.evidenceUploadedAt) : "",
      createdAt: raw.createdAt ? String(raw.createdAt) : "",
      approvedAt: raw.approvedAt ? String(raw.approvedAt) : null,
    };
  }

  async function fetchLostReports() {
    if (typeof window === "undefined" || !localStorage.getItem("token")) {
      redirectUnauthorized();
      return;
    }
    try {
      const res = await fetchAdminData("/api/reports?light=1", localStorage.getItem("token") || "");
      if (res.status === 401) {
        redirectUnauthorized();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) return;
      const mapped = (data.data as any[])
        .filter((r) => r.type === "LOST")
        .map((r) => {
          const images: string[] = Array.isArray(r.imageUrls) && r.imageUrls.length
            ? r.imageUrls
            : r.imageUrl
              ? [r.imageUrl]
              : [];
          return {
            id: r.id,
            itemName: r.itemName || "Unknown item",
            category: r.category || "Others",
            description: r.description || "",
            location: r.location || "",
            date: String(r.date || r.createdAt || "").slice(0, 10),
            status: r.status || "PENDING",
            images,
            student: r.user?.name || "Unknown",
            studentId: r.user?.studentId || "—",
            studentEmail: r.user?.email || "",
            createdAt: r.createdAt ? String(r.createdAt) : "",
            reviewedAt: r.reviewedAt ? String(r.reviewedAt) : null,
          };
        });
      setLostReports(mapped);
      lostReportsCache = mapped;
    } catch {
      // Lost list stays as-is; claims can still be reviewed.
    } finally {
      setLostLoaded(true);
    }
  }

  async function fetchClaims(openId?: string | null) {
    if (typeof window === "undefined" || !localStorage.getItem("token")) {
      setLoading(false);
      redirectUnauthorized();
      return;
    }
    if (!claimsCache) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchAdminData("/api/claims?light=1", localStorage.getItem("token") || "");
      if (res.status === 401) {
        redirectUnauthorized();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.error || "Failed to load claims");
      const mapped = (data.data as any[]).map(mapApiClaim);
      setClaims(mapped);
      claimsCache = mapped;
      if (openId) {
        const target = mapped.find((c) => c.id === openId);
        if (target) {
          setCompareClaim(target);
          showCenteredMessage("success", "Opened claim from dashboard");
        }
      }
    } catch (e) {
      if (!claimsCache) setClaims([]);
      setLoadError(e instanceof Error ? e.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    const s = localStorage.getItem("user");
    setUser(s ? JSON.parse(s) : { name: "Admin User", role: "ADMIN" });
    // Merge student evidence claims
    let openId: string | null = null;
    if (typeof window !== "undefined") {
      openId = new URLSearchParams(window.location.search).get("open");
      if (openId) window.history.replaceState(null, "", window.location.pathname);
    }
    fetchClaims(openId);
    void fetchLostReports();
  }, []);

  function handleLogout() { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/login?skip=1&loggedOut=1"); }
  useEscapeKey(!!compareClaim, () => setCompareClaim(null));
  useEscapeKey(!!claimItemDetail, () => setClaimItemDetail(null));
  useEscapeKey(!!matchTarget && !photoViewer && !matchPreview, () => { if (!matching) setMatchTarget(null); }, !matching);
  useEscapeKey(!!matchPreview && !photoViewer, () => setMatchPreview(null));
  useEscapeKey(!!lostDetail && !photoViewer, () => setLostDetail(null));

  if (!user || !mounted) return null;

  // Claims and lost reports share one verification queue.
  const claimedReportIds = activeLinkedReportIds(claims);
  const rows: VerificationRow[] = [
    ...claims.map((cl) => ({
      kind: "CLAIM" as const,
      id: cl.id,
      itemName: cl.itemName,
      category: cl.category,
      student: cl.student,
      studentEmail: cl.studentEmail || "",
      studentId: cl.studentId,
      location: cl.location,
      date: cl.date,
      status: cl.status,
      searchFields: [
        cl.itemName, cl.category, cl.student, cl.studentEmail || "", cl.studentId,
        cl.location, cl.status, cl.locker || "", cl.id,
        cl.locker ? `locker ${cl.locker}` : "", ...dateSearchValues(cl.date),
      ],
      claim: cl,
    })),
    ...lostReports
      .filter((report) => report.status !== "CLOSED" && (report.status !== "MATCHED" || !claimedReportIds.has(report.id)))
      .map((report) => ({
        kind: "LOST" as const,
        id: report.id,
        itemName: report.itemName,
        category: report.category,
        student: report.student,
        studentEmail: report.studentEmail || "",
        studentId: report.studentId,
        location: report.location,
        date: report.date,
        status: report.status,
        searchFields: [
          report.itemName, report.category, report.description, report.location,
          report.student, report.studentEmail || "", report.studentId,
          report.id, ...dateSearchValues(report.date),
        ],
        report,
      })),
  ];

  // A found item can have several pending claims. Count them so the queue can
  // show the rivalry and open all claims for one item side by side.
  const pendingClaimCount = new Map<string, number>();
  for (const cl of claims) {
    if (cl.status !== "PENDING") continue;
    pendingClaimCount.set(cl.itemId, (pendingClaimCount.get(cl.itemId) || 0) + 1);
  }
  const itemFilterCount = itemFilter
    ? claims.filter((cl) => cl.itemId === itemFilter.id && cl.status === "PENDING").length
    : 0;
  const compareRivals = compareClaim
    ? claims.filter(
        (cl) =>
          cl.itemId === compareClaim.itemId &&
          cl.id !== compareClaim.id &&
          cl.status === "PENDING",
      )
    : [];

  const filteredRows = rows.filter((row) => {
    if (kindFilter !== "ALL" && row.kind !== kindFilter) return false;
    if (itemFilter && (row.kind !== "CLAIM" || row.claim?.itemId !== itemFilter.id)) return false;
    if (statusFilter !== "All" && row.status !== statusFilter) return false;
    return matchesSearch(query, row.searchFields);
  });

  const hasFilters = Boolean(
    query || statusFilter !== "PENDING" || sortOrder !== "newest" || itemFilter || kindFilter !== "ALL",
  );

  function resetFilters() {
    setKindOpen(false);
    setStatusOpen(false);
    setQuery("");
    setStatusFilter("PENDING");
    setSortOrder("newest");
    setItemFilter(null);
    setKindFilter("ALL");
    setPage(1);
  }

  const statusPriority: Record<string, number> = { PENDING: 0, MATCHED: 1, APPROVED: 2, REJECTED: 3 };
  const sortedRows = [...filteredRows].sort((a, b) => {
    const p = (statusPriority[a.status] ?? 9) - (statusPriority[b.status] ?? 9);
    if (p !== 0) return p;
    const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
    return sortOrder === "newest" ? diff : -diff;
  });

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  // Reserve the extra comparison row only when a visible card needs it.
  // All cards on the current page still share the same section positions.
  const verificationHeaderHeight = paginatedRows.some((row) =>
    row.claim?.status === "PENDING" && (pendingClaimCount.get(row.claim.itemId) || 0) > 1,
  ) ? "h-[108px]" : "h-[80px]";

  const claimItemDetailPhotos = claimItemDetail
    ? claimItemDetail.itemImageUrls?.length
      ? claimItemDetail.itemImageUrls
      : claimItemDetail.itemImageUrl
        ? [claimItemDetail.itemImageUrl]
        : []
    : [];
  const lostDetailPhotos = lostDetail?.images ?? [];
  const compareItemPhotos = uniquePhotos(compareClaim?.itemImageUrls?.length
    ? compareClaim.itemImageUrls : [compareClaim?.itemImageUrl]);


  function movePhoto(key: string, delta: number, total: number) {
    setPhotoIndices((prev) => {
      if (total < 1) return prev;
      const current = Math.min(Math.max(0, prev[key] ?? 0), total - 1);
      return { ...prev, [key]: (current + delta + total) % total };
    });
  }

  async function firstAvailableLocker(): Promise<string | null> {
    try {
      const res = await fetch("/api/lockers?status=AVAILABLE", { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.data) && data.data.length) return data.data[0].lockerNumber;
    } catch {}
    return null;
  }

  async function handleApprove(id: string, note?: string) {
    try {
      const target = claims.find((claim) => claim.id === id);
      // Keep an already-assigned locker; only allocate one when the item has none.
      const lockerNumber = target?.locker ? null : await firstAvailableLocker();
      const res = await fetch(`/api/claims/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          action: "approve",
          ...(lockerNumber ? { lockerNumber } : {}),
          ...(note?.trim() ? { adminNote: note.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Approve failed");
      const assigned = lockerNumber || target?.locker;
      showCenteredMessage("success", assigned ? `Claim approved — locker ${assigned} assigned` : "Claim approved");
      invalidateAdminData();
      await Promise.all([fetchClaims(), fetchLostReports()]);
      // The rivalry is resolved once a winner is approved.
      setItemFilter(null);
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Approve failed");
    }
  }

  async function openMatchFor(report: LostReport) {
    setMatchTarget(report);
    setMatchQuery("");
    setShowMatchSearch(false);
    try {
      const res = await fetch("/api/items?status=FOUND&light=1", { headers: authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) return;
      setFoundItems(
        (data.data as any[]).map((it) => ({
          id: it.id,
          itemName: it.itemName,
          category: it.category,
          description: it.description,
          foundLocation: it.foundLocation,
          foundDate: it.foundDate,
          imageUrl: it.imageUrl || null,
          locker: it.locker || null,
        })),
      );
    } catch {
      showCenteredMessage("error", "Could not load found items");
    }
  }

  async function openMatchPreview(item: FoundItem) {
    setMatchPreview({ item, images: item.imageUrl ? [item.imageUrl] : [], index: 0 });
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(item.id)}`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      const fresh = data?.data;
      if (!res.ok || !data?.success || !fresh) return;
      const reportImages: string[] = Array.isArray(fresh.reports)
        ? fresh.reports.flatMap((r: any) => (Array.isArray(r.imageUrls) ? r.imageUrls : []))
        : [];
      const images = await dedupePhotos(itemPhotoSources(item.imageUrl, fresh.imageUrl, reportImages));
      setMatchPreview((prev) => {
        if (!prev || prev.item.id !== item.id) return prev;
        const merged = images.length ? images : prev.images;
        return { ...prev, images: merged, index: Math.min(prev.index, Math.max(0, merged.length - 1)) };
      });
    } catch {
      // Keep the list photo.
    }
  }

  async function handleMatch(itemId: string) {
    if (!matchTarget || matching) return;
    setMatching(true);
    try {
      const res = await fetch("/api/claims/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ reportId: matchTarget.id, itemId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data.error || "Match failed");
      showCenteredMessage("success", "Report matched — claim approved and pickup QR ready");
      setMatchTarget(null);
      invalidateAdminData();
      await fetchLostReports();
      await fetchClaims();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Match failed");
    } finally {
      setMatching(false);
    }
  }

  async function handleRejectSubmit() {
    if (!rejectTarget || rejecting) return;
    setRejecting(true);
    try {
      const endpoint = rejectTarget.kind === "CLAIM" ? `/api/claims/${rejectTarget.id}` : `/api/reports/${rejectTarget.id}`;
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action: "reject", ...(rejectNote.trim() ? { adminNote: rejectNote.trim() } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data.error || "Reject failed");
      showCenteredMessage("success", rejectTarget.kind === "CLAIM" ? "Claim rejected" : "Lost report rejected");
      setRejectTarget(null);
      setRejectNote("");
      invalidateAdminData();
      if (rejectTarget.kind === "CLAIM") await Promise.all([fetchClaims(), fetchLostReports()]);
      else await fetchLostReports();
    } catch (e: any) {
      showCenteredMessage("error", e?.message || "Reject failed");
    } finally {
      setRejecting(false);
    }
  }

  const suggestions = matchTarget
    ? suggestMatches(
        {
          itemName: matchTarget.itemName,
          category: matchTarget.category,
          description: matchTarget.description,
          location: matchTarget.location,
          date: matchTarget.date,
        },
        foundItems,
        { limit: 3 },
      )
    : [];
  const suggestionRows = suggestions.flatMap((suggestion) => {
    const item = foundItems.find((candidate) => candidate.id === suggestion.itemId);
    return item ? [{ ...suggestion, item }] : [];
  });
  const matchResults = foundItems.filter((item) =>
    matchesSearch(matchQuery, [
      item.itemName,
      item.description,
      item.foundLocation,
      item.category,
      item.locker?.lockerNumber ? `locker ${item.locker.lockerNumber}` : "",
    ])
  ).slice(0, 8);

  return (
    <StudentShell active="Claims" userName={user.name} userRole={user.role} pageTitle="Claim Verification" bottomNav={adminNav} logout={handleLogout}>
      <main className="bg-white min-h-[calc(100vh-52px)] pb-28 lg:pb-6 flex flex-col overflow-x-hidden">
        <div className="px-4 sm:px-6 lg:px-12 pt-5 lg:pt-6 w-full min-w-0 flex flex-col">
          <FilterPanel
            search={
              <VSearchInput value={query} onChange={(v) => { setQuery(v); setPage(1); }} className="w-full"
                size="lg" clearable placeholder="Search item, student, or claim ID" />
            }
            filters={
              <>
                <VDropdown open={statusOpen} onOpenChange={setStatusOpen} width="w-36" trigger={
                  <VFilterButton aria-label="Verification status" aria-expanded={statusOpen} aria-controls="verification-status-options"
                    active={statusFilter !== "All" && statusFilter !== "PENDING"} onClick={() => { setKindOpen(false); setSortOpen(false); setStatusOpen(!statusOpen); }}>
                    <span>{statusFilter === "All" ? "All statuses" : reportStatusLabel(statusFilter)}</span>
                    <ChevronDown size={12} />
                  </VFilterButton>
                }>
                  {(close) => (
                    <div id="verification-status-options" role="group" aria-label="Verification status options">
                      {statusOptions.map(value => (
                        <VDropdownItem key={value} active={statusFilter === value} onSelect={() => { setStatusFilter(value); setPage(1); close(); }}>
                          {value === "All" ? "All statuses" : reportStatusLabel(value)}
                        </VDropdownItem>
                      ))}
                    </div>
                  )}
                </VDropdown>
                <VDropdown open={kindOpen} onOpenChange={setKindOpen} width="w-36" trigger={
                  <VFilterButton aria-label="Report type" aria-expanded={kindOpen} aria-controls="verification-type-options"
                    active={kindFilter !== "ALL"} onClick={() => { setStatusOpen(false); setSortOpen(false); setKindOpen(!kindOpen); }}>
                    <span>{kindFilter === "ALL" ? "All types" : kindFilter === "CLAIM" ? "Claim" : "Lost"}</span>
                    <ChevronDown size={12} />
                  </VFilterButton>
                }>
                  {(close) => (
                    <div id="verification-type-options" role="group" aria-label="Report type options">
                      {([ ["ALL", "All types"], ["CLAIM", "Claim"], ["LOST", "Lost"] ] as const).map(([value, label]) => (
                        <VDropdownItem key={value} active={kindFilter === value} onSelect={() => { setKindFilter(value); setItemFilter(null); setPage(1); close(); }}>{label}</VDropdownItem>
                      ))}
                    </div>
                  )}
                </VDropdown>

                <VDropdown open={sortOpen} onOpenChange={setSortOpen} width="w-32"
                  trigger={
                    <VFilterButton active={sortOrder !== "newest"} onClick={() => { setKindOpen(false); setStatusOpen(false); setSortOpen(!sortOpen); }}>
                      <ArrowUpDown size={13} style={{ color: c.textMuted }} />
                      <span>{sortOrder === "newest" ? "Newest" : "Oldest"}</span>
                      <ChevronDown size={12} style={{ color: c.textMuted }} />
                    </VFilterButton>
                  }>
                  {(close) => (
                    <>
                      <VDropdownItem active={sortOrder === "newest"} onSelect={() => { setSortOrder("newest"); setPage(1); close(); }}>Newest</VDropdownItem>
                      <VDropdownItem active={sortOrder === "oldest"} onSelect={() => { setSortOrder("oldest"); setPage(1); close(); }}>Oldest</VDropdownItem>
                    </>
                  )}
                </VDropdown>
              </>
            }
            reset={<ResetFiltersButton disabled={!hasFilters} onClick={resetFilters} />}
          />

          {itemFilter && (
            <div className="flex flex-wrap items-center gap-2 mb-4 -mt-3">
              <span className="inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5"
                style={{ color: "#92400e", backgroundColor: "#fef3c7", border: "1px solid #fde68a" }}>
                <Users size={12} />
                Comparing {itemFilterCount} {itemFilterCount === 1 ? "pending claim" : "pending claims"} for{" "}
                <strong>{itemFilter.name}</strong>
              </span>
              <button type="button"
                onClick={() => { setItemFilter(null); setPage(1); }}
                className="text-xs font-semibold cursor-pointer underline-offset-2 hover:underline"
                style={{ color: c.primary }}>
                Show all items
              </button>
            </div>
          )}

          <VContentPanel>
          {loading ? (
            <AdminListSkeleton />
          ) : loadError && claims.length === 0 ? (
            <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
              <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
              <p className="text-base font-medium" style={{ color: c.textMuted }}>Could not load verification queue</p>
              <p className="text-sm mt-1 mb-5" style={{ color: c.textLight }}>{loadError}</p>
              <VButton variant="secondary" onClick={() => void Promise.all([fetchClaims(), fetchLostReports()])}>
                <RotateCcw size={14} /> Try again
              </VButton>
            </VCard>
          ) : sortedRows.length === 0 ? (
            !lostLoaded ? (
              <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
                <Loader2 size={30} className="animate-spin mb-3" style={{ color: c.primary }} />
                <p className="text-sm font-medium" style={{ color: c.textMuted }}>Loading lost reports…</p>
              </VCard>
            ) : (
              <VCard className="py-20 text-center flex-1 flex flex-col items-center justify-center">
                <Search size={40} className="mx-auto mb-4" style={{ color: c.textLight }} />
                <p className="text-base font-medium" style={{ color: c.textMuted }}>No claims or lost reports found</p>
                <p className="text-sm mt-1" style={{ color: c.textLight }}>Try adjusting filters.</p>
              </VCard>
            )
          ) : (
            <>
              {!lostLoaded && (
                <p className="text-xs mb-3 inline-flex items-center gap-1.5" style={{ color: c.textMuted }}>
                  <Loader2 size={12} className="animate-spin" /> Loading lost reports…
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 content-start min-w-0">
                {paginatedRows.map((row) => {
                  if (row.kind === "CLAIM" && row.claim) {
                    const cl = row.claim;
                    const CatIcon = categoryIcon(cl.category);
                    const evidencePhotos = cl.evidenceImageUrls?.length
                      ? cl.evidenceImageUrls
                      : cl.evidencePreview
                        ? [cl.evidencePreview]
                        : [];
                    const itemPhotos = cl.itemImageUrls?.length
                      ? cl.itemImageUrls
                      : cl.itemImageUrl
                        ? [cl.itemImageUrl]
                        : [];
                    const itemKey = `${cl.id}-item`;
                    const evidenceKey = `${cl.id}-evidence`;
                    const itemPhotoIndex = Math.min(photoIndices[itemKey] ?? 0, Math.max(0, itemPhotos.length - 1));
                    const evidenceIndex = Math.min(photoIndices[evidenceKey] ?? 0, Math.max(0, evidencePhotos.length - 1));
                    return (
                      <VCard key={`claim-${cl.id}`} className="p-0 w-full min-w-0 flex flex-col h-full overflow-hidden transition-shadow duration-200 hover:shadow-lg">
                        <div className={`${verificationHeaderHeight} shrink-0 px-4 py-3 flex items-start gap-2.5`} data-verification-header>
                          <div className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
                            style={{ borderColor: c.borderLight, backgroundColor: c.primarySoft }}>
                            <CatIcon size={18} style={{ color: c.primary }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h3 className="flex-1 text-base font-semibold leading-snug truncate min-w-0" title={cl.itemName} style={{ color: c.text }}>{cl.itemName}</h3>
                              {cl.source === "MATCH" ? (
                                <VBadge className="shrink-0" color="#b45309">Lost</VBadge>
                              ) : (
                                <VBadge className="shrink-0" color="#15803d">Claim</VBadge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 min-w-0">
                              <p className="text-[11px] truncate flex-1" style={{ color: c.textMuted }}>
                                {cl.studentEmail || (cl.studentId !== "—" ? cl.studentId : cl.student)}
                              </p>
                            </div>
                            {cl.status === "PENDING" && (pendingClaimCount.get(cl.itemId) || 0) > 1 && (
                              <button type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setItemFilter({ id: cl.itemId, name: cl.itemName });
                                  setKindFilter("CLAIM");
                                  setStatusFilter("PENDING");
                                  setPage(1);
                                }}
                                className="mt-2 max-w-full inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-2 py-1 cursor-pointer"
                                style={{ color: "#92400e", backgroundColor: "#fef3c7", border: "1px solid #fde68a" }}>
                                <Users size={12} className="shrink-0" /> <span className="text-left">Compare {pendingClaimCount.get(cl.itemId)} pending claims</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="px-4 pb-4">
                          <DescriptionBox title="Claim explanation" className="h-[82px] overflow-hidden">{cl.reason || "No explanation provided."}</DescriptionBox>
                        </div>

                        <div className="order-first relative shrink-0 mx-2 mt-2 rounded-xl overflow-hidden border" style={{ borderColor: c.borderLight, backgroundColor: c.fill }} data-verification-photos>
                          <VBadge color={statusColor(cl.status)} className="absolute left-2 top-10 z-10 pointer-events-none shadow-sm" style={{ backgroundColor: c.card }}>{reportStatusLabel(cl.status)}</VBadge>
                          <div className="grid grid-cols-2 gap-2 aspect-[4/3]">
                            <div className="min-w-0 min-h-0 flex flex-col">
                              <p className="text-[10px] font-semibold px-2 py-2" style={{ color: c.textMuted }}>Found item</p>
                              <div className="relative flex-1 min-h-0 overflow-hidden">
                                {itemPhotos.length > 0 ? (
                                  <div className="absolute inset-0">
                                    <button type="button" aria-label="View found item details"
                                      className="absolute inset-0 w-full h-full block group cursor-pointer"
                                      style={{ backgroundColor: c.fill }}
                                      onClick={() => { setDetailPhotoIndex(itemPhotoIndex); setClaimItemDetail(cl); }}>
                                      <img key={itemPhotos[itemPhotoIndex]} src={itemPhotos[itemPhotoIndex]} alt={`Found item photo ${itemPhotoIndex + 1}`} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-150 flex items-center justify-center">
                                        <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                                          <Eye size={12} /> Item details
                                        </span>
                                      </span>
                                    </button>
                                    {itemPhotos.length > 1 && (
                                      <>
                                        <button type="button" aria-label="Previous item photo"
                                          className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer"
                                          style={{ color: c.textMuted }}
                                          onClick={(e) => { e.stopPropagation(); movePhoto(itemKey, -1, itemPhotos.length); }}>
                                          <ChevronLeft size={14} />
                                        </button>
                                        <button type="button" aria-label="Next item photo"
                                          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer"
                                          style={{ color: c.textMuted }}
                                          onClick={(e) => { e.stopPropagation(); movePhoto(itemKey, 1, itemPhotos.length); }}>
                                          <ChevronRight size={14} />
                                        </button>
                                        <span className="absolute top-1.5 right-1.5 z-10 h-5 min-w-[28px] px-1.5 rounded-full bg-black/60 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                                          {itemPhotoIndex + 1}/{itemPhotos.length}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                                    style={{ backgroundColor: c.fill, color: c.textLight }}>
                                    <Package size={22} />
                                    <span className="text-[10px]">No item photo</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="min-w-0 min-h-0 flex flex-col">
                              <p className="text-[10px] font-semibold px-2 py-2" style={{ color: c.textMuted }}>Student evidence</p>
                              <div className="relative flex-1 min-h-0 overflow-hidden">
                                {evidencePhotos.length > 0 ? (
                                  <div className="absolute inset-0">
                                    <button type="button" aria-label="View student evidence photo"
                                      className="absolute inset-0 w-full h-full block group cursor-pointer"
                                      style={{ backgroundColor: c.fill }}
                                      onClick={() => setPhotoViewer({ photos: evidencePhotos, index: evidenceIndex, title: `${cl.itemName} evidence` })}>
                                      <img key={evidencePhotos[evidenceIndex]} src={evidencePhotos[evidenceIndex]} alt={`Student evidence photo ${evidenceIndex + 1}`} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-150" />
                                    </button>
                                    {evidencePhotos.length > 1 && (
                                      <>
                                        <button type="button" aria-label="Previous evidence photo"
                                          className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer"
                                          style={{ color: c.textMuted }}
                                          onClick={(e) => { e.stopPropagation(); movePhoto(evidenceKey, -1, evidencePhotos.length); }}>
                                          <ChevronLeft size={14} />
                                        </button>
                                        <button type="button" aria-label="Next evidence photo"
                                          className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer"
                                          style={{ color: c.textMuted }}
                                          onClick={(e) => { e.stopPropagation(); movePhoto(evidenceKey, 1, evidencePhotos.length); }}>
                                          <ChevronRight size={14} />
                                        </button>
                                        <span className="absolute top-1.5 right-1.5 z-10 h-5 min-w-[28px] px-1.5 rounded-full bg-black/60 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                                          {evidenceIndex + 1}/{evidencePhotos.length}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1"
                                    style={{ backgroundColor: c.fill, color: c.textLight }}>
                                    <Camera size={22} />
                                    <span className="text-[10px]">No evidence photo</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <VerificationCardFooter submittedAt={cl.createdAt || cl.date}
                          reviewLabel={cl.status === "APPROVED" ? "Approved by admin" : cl.status === "REJECTED" ? "Rejected by admin" : undefined}
                          reviewedAt={cl.approvedAt}>
                          {cl.status === "PENDING" && (
                            <>
                              <VButton variant="danger" size="sm" onClick={() => { setRejectNote(""); setRejectTarget({ kind: "CLAIM", id: cl.id, itemName: cl.itemName }); }}>
                                <XCircle size={13} /> Reject
                              </VButton>
                              <VButton size="sm" onClick={() => { setApproveNote(""); setApproveTarget({ id: cl.id, itemName: cl.itemName }); }}>
                                <CheckCircle2 size={13} /> Approve
                              </VButton>
                            </>
                          )}
                        </VerificationCardFooter>
                      </VCard>
                    );
                  }

                  const report = row.report!;
                  const Icon = categoryIcon(report.category);
                  return (
                    <VCard key={`lost-${report.id}`} className="p-0 w-full min-w-0 flex flex-col h-full overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-200" onClick={() => { setDetailPhotoIndex(0); setLostDetail(report); }}>
                      <div className={`${verificationHeaderHeight} shrink-0 px-4 py-3 flex items-start gap-2.5`} data-verification-header>
                        <div className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
                          style={{ borderColor: c.borderLight, backgroundColor: c.primarySoft }}>
                          <Icon size={18} style={{ color: c.primary }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="flex-1 text-base font-semibold leading-snug truncate min-w-0" title={report.itemName} style={{ color: c.text }}>{report.itemName}</h3>
                            <VBadge className="shrink-0" color="#b45309">Lost</VBadge>
                          </div>
                          <div className="flex items-center gap-2 mt-1 min-w-0">
                            <p className="text-[11px] truncate flex-1" style={{ color: c.textMuted }}>
                              {report.studentEmail || (report.studentId !== "—" ? report.studentId : report.student)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 pb-4">
                        <DescriptionBox title="Report description" className="h-[82px] overflow-hidden">{report.description || "No description provided."}</DescriptionBox>
                      </div>

                        <div className="order-first relative shrink-0 mx-2 mt-2" data-verification-photos onClick={(e) => e.stopPropagation()}>
                          <VBadge color={statusColor(report.status)} className="absolute left-3 top-3 z-10 pointer-events-none shadow-sm" style={{ backgroundColor: c.card }}>{reportStatusLabel(report.status)}</VBadge>
                          <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.borderLight }}>
                          <button type="button" aria-label={`View ${report.itemName} report details`}
                            className="w-full aspect-[4/3] relative block group cursor-pointer"
                            style={{ backgroundColor: c.fill }}
                            onClick={() => { setDetailPhotoIndex(0); setLostDetail(report); }}>
                            {report.images.length > 0 ? (
                              <img src={report.images[0]} alt="Report photo" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                              <span className="flex h-full flex-col items-center justify-center gap-1" style={{ color: c.textLight }}><Camera size={22} /><span className="text-[10px]">No report photo</span></span>
                            )}
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-150 flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] font-semibold text-white">
                                <Eye size={12} /> Report details
                              </span>
                            </span>
                            {report.images.length > 1 && (
                              <span className="absolute top-2 right-2 rounded-full bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5">
                                {report.images.length} photos
                              </span>
                            )}
                          </button>
                          </div>
                        </div>

                      <div onClick={(e) => e.stopPropagation()} className="mt-auto">
                        <VerificationCardFooter submittedAt={report.createdAt || report.date}
                          reviewLabel={report.status === "REJECTED" ? "Rejected by admin" : report.status === "MATCHED" ? "Matched by admin" : undefined}
                          reviewedAt={report.reviewedAt}>
                          {report.status === "PENDING" && (
                            <>
                              <VButton variant="danger" size="sm" onClick={() => { setRejectNote(""); setRejectTarget({ kind: "LOST", id: report.id, itemName: report.itemName }); }}>
                                <XCircle size={13} /> Reject
                              </VButton>
                              <VButton size="sm" onClick={() => void openMatchFor(report)}><PackageSearch size={13} /> Match</VButton>
                            </>
                          )}
                        </VerificationCardFooter>
                      </div>
                    </VCard>
                  );
                })}
              </div>
              <VPaginationFooter current={currentPage} total={totalPages} pageSize={pageSize} itemCount={sortedRows.length} onPage={setPage} />
            </>
          )}
          </VContentPanel>
        </div>
      </main>

      {claimItemDetail && (
        <ItemDetailsModal
          zIndex="z-[70]"
          title={claimItemDetail.itemName}
          statusLabel={claimItemDetail.itemStatus === "CLAIMED" ? "Claimed" : claimItemDetail.itemStatus === "RETRIEVED" ? "Retrieved" : "Found"}
          statusColor={claimItemDetail.itemStatus === "CLAIMED" ? c.primary : c.accent}
          category={claimItemDetail.category}
          location={claimItemDetail.location}
          date={fmtDateValue(claimItemDetail.itemFoundDate)}
          description={claimItemDetail.itemDescription || ""}
          photos={claimItemDetailPhotos}
          photoIndex={detailPhotoIndex}
          onPhotoIndexChange={setDetailPhotoIndex}
          onViewPhoto={() => setPhotoViewer({ photos: claimItemDetailPhotos, index: detailPhotoIndex, title: claimItemDetail.itemName })}
          onClose={() => { setClaimItemDetail(null); setDetailPhotoIndex(0); }}
          footer={<VButton variant="secondary" className="flex-1" onClick={() => setClaimItemDetail(null)}>Close</VButton>}
        />
      )}

      {/* Compare photos pop-out */}
      {lostDetail && (
        <ItemDetailsModal
          zIndex="z-[60]"
          title={lostDetail.itemName}
          statusLabel={lostDetail.status === "PENDING" ? "Pending" : lostDetail.status === "MATCHED" ? "Matched" : lostDetail.status === "REJECTED" ? "Rejected" : lostDetail.status === "CLOSED" ? "Closed" : lostDetail.status}
          statusColor={statusColor(lostDetail.status)}
          category={lostDetail.category}
          location={lostDetail.location}
          date={fmtDateValue(lostDetail.date)}
          description={lostDetail.description}
          photos={lostDetailPhotos}
          photoIndex={detailPhotoIndex}
          onPhotoIndexChange={setDetailPhotoIndex}
          onViewPhoto={() => setPhotoViewer({ photos: lostDetailPhotos, index: detailPhotoIndex, title: lostDetail.itemName })}
          onClose={() => { setLostDetail(null); setDetailPhotoIndex(0); }}
          extra={<span className="flex items-center gap-1"><Users size={12} /> {lostDetail.student} ({lostDetail.studentEmail || lostDetail.studentId})</span>}
          footer={lostDetail.status === "PENDING" ? (
            <>
              <VButton variant="danger" className="flex-1" onClick={() => { const target = lostDetail; setLostDetail(null); setRejectTarget({ kind: "LOST", id: target.id, itemName: target.itemName }); setRejectNote(""); }}>
                <XCircle size={14} /> Reject
              </VButton>
              <VButton className="flex-1" onClick={() => { const target = lostDetail; setLostDetail(null); void openMatchFor(target); }}>
                <PackageSearch size={14} /> Match
              </VButton>
            </>
          ) : undefined}
        />
      )}

      {photoViewer && (
        <PhotoViewerModal
          photos={photoViewer.photos}
          index={photoViewer.index}
          title={photoViewer.title}
          onIndexChange={(index) => setPhotoViewer((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setPhotoViewer(null)}
        />
      )}

      {approveTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => { if (!approving) setApproveTarget(null); }} />
          <VCard className="relative w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Approve claim?</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{approveTarget.itemName}</p>
              </div>
              <button type="button" onClick={() => { if (!approving) setApproveTarget(null); }} aria-label="Close approve dialog"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>
              Reason <span className="font-normal" style={{ color: c.textLight }}>(optional)</span>
            </label>
            <VTextarea value={approveNote} onChange={(e) => setApproveNote(e.target.value)} rows={3}
              maxLength={500} placeholder="Add a note for the student (optional)..." />
            <p className="text-[11px] mt-2" style={{ color: c.textLight }}>
              A locker is assigned automatically and the student can generate the pickup QR immediately.
            </p>

            <div className="flex items-center justify-end gap-2 mt-5">
              <VButton variant="secondary" onClick={() => { if (!approving) setApproveTarget(null); }}>Cancel</VButton>
              <VButton onClick={async () => {
                if (approving) return;
                setApproving(true);
                await handleApprove(approveTarget.id, approveNote);
                setApproving(false);
                setApproveTarget(null);
              }} disabled={approving}>
                {approving ? "Approving..." : "Approve"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => { if (!rejecting) setRejectTarget(null); }} />
          <VCard className="relative w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>
                  {rejectTarget.kind === "CLAIM" ? "Reject claim?" : "Reject lost report?"}
                </h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{rejectTarget.itemName}</p>
              </div>
              <button type="button" onClick={() => { if (!rejecting) setRejectTarget(null); }} aria-label="Close reject dialog"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <label className="text-xs font-semibold mb-1.5 block" style={{ color: c.text }}>
              Reason <span className="font-normal" style={{ color: c.textLight }}>(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(rejectTarget.kind === "CLAIM" ? CLAIM_REJECT_REASONS : LOST_REJECT_REASONS).map((reason) => {
                const active = rejectNote === reason;
                return (
                  <button key={reason} type="button" onClick={() => setRejectNote(active ? "" : reason)}
                    className="h-7 px-2.5 rounded-full border text-[11px] font-medium cursor-pointer transition-colors duration-150"
                    style={{
                      borderColor: active ? c.danger : c.border,
                      color: active ? c.danger : c.textMuted,
                      backgroundColor: active ? "#fef2f2" : "#fff",
                    }}>
                    {reason}
                  </button>
                );
              })}
            </div>
            <VTextarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3}
              maxLength={500} placeholder="Let the student know why it was rejected..." />

            <div className="flex items-center justify-end gap-2 mt-5">
              <VButton variant="secondary" onClick={() => { if (!rejecting) setRejectTarget(null); }}>Cancel</VButton>
              <VButton variant="danger" onClick={handleRejectSubmit} disabled={rejecting}>
                {rejecting ? "Rejecting..." : "Reject"}
              </VButton>
            </div>
          </VCard>
        </div>
      )}

      {matchTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => { if (!matching) setMatchTarget(null); }} />
          <VCard className="relative w-full max-w-2xl max-h-[90vh] overflow-auto p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Match a found item</h3>
                <p className="text-xs mt-1" style={{ color: c.textMuted }}>{matchTarget.itemName} · {matchTarget.student}</p>
              </div>
              <button type="button" onClick={() => { if (!matching) setMatchTarget(null); }} aria-label="Close match dialog"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] cursor-pointer shrink-0" style={{ color: c.textMuted }}>
                <X size={16} />
              </button>
            </div>

            <p className="text-xs mb-3" style={{ color: c.textMuted }}>
              The lost report is matched and the claim is approved immediately. The student gets a pickup QR right away.
            </p>

            {!showMatchSearch && suggestionRows.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold flex items-center gap-1.5 mb-2" style={{ color: c.text }}>
                  <Sparkles size={13} style={{ color: c.primary }} /> Suggested matches
                </p>
                <div className="space-y-2">
                  {suggestionRows.map(({ item, score }) => {
                    const chip =
                      score >= 70
                        ? { backgroundColor: "#dcfce7", color: "#15803d" }
                        : score >= 50
                          ? { backgroundColor: "#dbeafe", color: "#1d4ed8" }
                          : { backgroundColor: c.fill, color: c.textMuted };
                    return (
                      <div key={`suggest-${item.id}`} className="flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer hover:bg-[#f8fafc] transition-colors duration-150"
                        style={{ borderColor: c.borderLight, backgroundColor: c.card }}
                        onClick={() => void openMatchPreview(item)}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.itemName} loading="lazy" decoding="async" className="w-10 h-10 rounded-lg object-contain" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.fill }}>
                            <Package size={16} style={{ color: c.primary }} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: c.text }}>{item.itemName}</p>
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={chip}>
                              {suggestionLabel(score)} {score}
                            </span>
                          </div>
                          <p className="text-[11px] truncate" style={{ color: c.textMuted }}>
                            {item.category || "Others"} · {item.foundDate ? String(item.foundDate).slice(0, 10) : "—"}{item.foundLocation ? ` · ${item.foundLocation}` : ""}{item.locker ? ` · Locker ${item.locker.lockerNumber}` : ""}
                          </p>
                        </div>
                        <VButton variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); void openMatchPreview(item); }}>
                          View
                        </VButton>
                        <VButton size="sm" disabled={matching} onClick={(e) => { e.stopPropagation(); setConfirmMatchItem(item); }}>
                          Match
                        </VButton>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {suggestionRows.length > 0 && !showMatchSearch ? (
              <button type="button"
                className="text-[11px] font-semibold underline hover:opacity-70 cursor-pointer"
                style={{ color: c.primary }}
                onClick={() => { setShowMatchSearch(true); setMatchQuery(""); }}>
                Search all found items
              </button>
            ) : (
              <>
                <VSearchInput value={matchQuery} onChange={setMatchQuery} placeholder="Search found items..." className="mb-3" />
                <div className="space-y-2 max-h-56 overflow-auto">
                  {matchResults.length === 0 ? (
                    <p className="text-xs py-3 text-center" style={{ color: c.textLight }}>No found items match your search.</p>
                  ) : matchResults.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer hover:bg-[#f8fafc] transition-colors duration-150" style={{ borderColor: c.borderLight }}
                      onClick={() => void openMatchPreview(item)}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.itemName} loading="lazy" decoding="async" className="w-10 h-10 rounded-lg object-contain" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.fill }}>
                          <Package size={16} style={{ color: c.primary }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: c.text }}>{item.itemName}</p>
                        <p className="text-[11px] truncate" style={{ color: c.textMuted }}>
                          {item.category || "Others"} · {item.foundLocation || "—"} · {item.foundDate ? String(item.foundDate).slice(0, 10) : "—"}{item.locker ? ` · Locker ${item.locker.lockerNumber}` : ""}
                        </p>
                      </div>
                      <VButton variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); void openMatchPreview(item); }}>
                        View
                      </VButton>
                      <VButton size="sm" disabled={matching} onClick={(e) => { e.stopPropagation(); setConfirmMatchItem(item); }}>
                        Match
                      </VButton>
                    </div>
                  ))}
                </div>
              </>
            )}
          </VCard>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmMatchItem}
        title="Match and approve this item?"
        tone="primary"
        confirmLabel="Match & approve"
        onCancel={() => setConfirmMatchItem(null)}
        onConfirm={() => {
          const item = confirmMatchItem;
          setConfirmMatchItem(null);
          if (item) void handleMatch(item.id);
        }}
      />

      {matchPreview && (
        <ItemDetailsModal
          zIndex="z-[70]"
          title={matchPreview.item.itemName}
          statusLabel="Found"
          statusColor={c.primary}
          category={matchPreview.item.category || "Others"}
          location={matchPreview.item.foundLocation}
          date={matchPreview.item.foundDate ? String(matchPreview.item.foundDate).slice(0, 10) : "—"}
          description={matchPreview.item.description}
          photos={matchPreview.images}
          photoIndex={matchPreview.index}
          onPhotoIndexChange={(index) => setMatchPreview((prev) => (prev ? { ...prev, index } : prev))}
          onViewPhoto={() => setPhotoViewer({ photos: matchPreview.images, index: matchPreview.index, title: matchPreview.item.itemName })}
          onClose={() => setMatchPreview(null)}
          footer={<VButton variant="secondary" className="flex-1" onClick={() => setMatchPreview(null)}>Close</VButton>}
        />
      )}

      {compareClaim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 vq-modal-backdrop" style={{ backgroundColor: "rgba(2,6,23,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={() => setCompareClaim(null)} />
          <VCard role="dialog" aria-modal="true" aria-label="Claim Details" className="relative w-full min-w-0 max-w-2xl max-h-[90dvh] overflow-y-auto overflow-x-hidden p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <h3 className="text-base font-semibold" style={{ color: c.text }}>Claim Details</h3>
                {compareClaim.status === "PENDING" && compareRivals.length > 0 && (
                  <button type="button"
                    onClick={() => {
                      const target = compareClaim;
                      setCompareClaim(null);
                      setItemFilter({ id: target.itemId, name: target.itemName });
                      setKindFilter("CLAIM");
                      setStatusFilter("PENDING");
                      setPage(1);
                    }}
                    className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-2 py-1 cursor-pointer"
                    style={{ color: "#92400e", backgroundColor: "#fef3c7", border: "1px solid #fde68a" }}>
                    <Users size={12} /> Compare all {compareRivals.length + 1} pending claims for this item
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setCompareClaim(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f1f5f9] transition-colors duration-200 cursor-pointer shrink-0" style={{ color: c.textMuted }}><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Found item photo</p>
                {compareItemPhotos.length ? (
                  <EvidenceSlider
                    photos={compareItemPhotos}
                    alt="Found item"
                    label="found item"
                    photoClassName="h-48"
                    caption={`${fmtDateValue(compareClaim.itemFoundDate)}${compareClaim.itemCreatedAt ? ` · ${fmtClockValue(compareClaim.itemCreatedAt)}` : ""}`}
                  />
                ) : (
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
                    <div className="w-full h-48 flex flex-col items-center justify-center gap-2 bg-[#f8fafc]" style={{ color: c.textLight }}>
                      <Package size={36} />
                      <span className="text-xs">No item photo uploaded</span>
                    </div>
                    <p className="text-[10px] text-center truncate px-1 py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>
                      <time className="vq-date">{fmtDateValue(compareClaim.itemFoundDate)}</time>
                      {compareClaim.itemCreatedAt ? ` · ${fmtClockValue(compareClaim.itemCreatedAt)}` : ""}
                    </p>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold mb-2" style={{ color: c.text }}>Student evidence photo</p>
                {(compareClaim.evidenceImageUrls?.length || compareClaim.evidencePreview) ? (
                  <EvidenceSlider
                    photos={compareClaim.evidenceImageUrls?.length ? compareClaim.evidenceImageUrls : [compareClaim.evidencePreview!]}
                    alt="Evidence"
                    photoClassName="h-48"
                    caption={`${fmtDateValue(compareClaim.evidenceUploadedAt || compareClaim.createdAt || compareClaim.date)}${(compareClaim.evidenceUploadedAt || compareClaim.createdAt) ? ` · ${fmtClockValue(compareClaim.evidenceUploadedAt || compareClaim.createdAt)}` : ""}`}
                  />
                ) : (
                  <div className="rounded-xl overflow-hidden border-2 border-dashed" style={{ borderColor: c.border }}>
                    <div className="w-full h-48 flex flex-col items-center justify-center gap-2" style={{ backgroundColor: c.fill, color: c.textLight }}>
                      <Camera size={22} />
                      <span className="text-xs">No photo evidence provided</span>
                    </div>
                    <p className="text-[10px] text-center truncate px-1 py-2" style={{ backgroundColor: c.fill, color: c.textMuted }}>
                      <time className="vq-date">{fmtDateValue(compareClaim.evidenceUploadedAt || compareClaim.createdAt || compareClaim.date)}</time>
                      {(compareClaim.evidenceUploadedAt || compareClaim.createdAt) ? ` · ${fmtClockValue(compareClaim.evidenceUploadedAt || compareClaim.createdAt)}` : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>
            {(compareClaim.matchedReportDescription || compareClaim.reason) && (
              <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: c.fill, borderColor: c.border }}>
                <p className="text-xs font-semibold mb-1.5" style={{ color: c.text }}>
                  {compareClaim.matchedReportDescription ? "Lost report description" : "Claim reason"}
                </p>
                <p className="text-sm leading-relaxed break-words max-h-32 overflow-y-auto" style={{ color: c.textMuted }}>
                  {compareClaim.matchedReportDescription || compareClaim.reason}
                </p>
                {compareClaim.matchedReportDescription && (
                  <p className="text-[11px] mt-1.5" style={{ color: c.textLight }}>
                    Auto-linked from the student&apos;s lost report.
                  </p>
                )}
              </div>
            )}

            {compareClaim.status === "REJECTED" && (
              <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: `color-mix(in srgb, ${c.danger} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${c.danger} 19%, transparent)` }}>
                <p className="text-xs font-semibold mb-1" style={{ color: c.danger }}>Rejected reason</p>
                <p className="text-sm leading-relaxed break-words max-h-24 overflow-y-auto" style={{ color: c.danger }}>
                  {compareClaim.adminNote || "No reason was provided."}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
              <VButton variant="secondary" onClick={() => setCompareClaim(null)}>Close</VButton>
              {compareClaim.status === "PENDING" && (
                <>
                  <VButton variant="danger" onClick={() => { setRejectTarget({ kind: "CLAIM", id: compareClaim.id, itemName: compareClaim.itemName }); setRejectNote(""); setCompareClaim(null); }}>
                    <XCircle size={14} /> Reject
                  </VButton>
                  <VButton onClick={() => { setApproveTarget({ id: compareClaim.id, itemName: compareClaim.itemName }); setApproveNote(""); setCompareClaim(null); }}>
                    <CheckCircle2 size={14} /> Approve
                  </VButton>
                </>
              )}
            </div>
          </VCard>
        </div>
      )}

    </StudentShell>
  );
}
