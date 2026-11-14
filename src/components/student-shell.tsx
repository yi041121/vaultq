"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Search, PlusCircle, FileText, BellRing, User, LogOut, PanelLeftClose, PanelLeftOpen, LayoutGrid, X, Plus, MessageCircle } from "lucide-react";
import { colors, iconSize } from "@/lib/design";
import CenteredMessageHost, { showCenteredMessage } from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAdminNavCounts } from "@/lib/use-admin-nav-counts";
import { getCachedUnread, prefetchStudentData } from "@/lib/student-cache";
import { useIdleSession } from "@/lib/use-idle-session";
import { clearClientSession } from "@/lib/idle-session";
import { endServerSession } from "@/lib/browser-session";
import { prefetchAdminData, prefetchAdminPage } from "@/lib/admin-data";
import { QUICK_ACTION_EVENT, quickActionsForRole, type QuickAction } from "@/lib/quick-actions";
import { GuidedAssistant } from "@/components/guided-assistant";

interface NavItem {
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  path?: string;
}

interface StudentShellProps {
  active: string;
  children: React.ReactNode;
  userName: string;
  userRole: string;
  pageTitle?: string;
  bell?: React.ReactNode;
  bottomNav?: NavItem[];
  logout: () => void;
}

const defaultNav: NavItem[] = [
  { label: "Home", icon: Home, path: "/dashboard/student" },
  { label: "Search", icon: Search, path: "/dashboard/student/search" },
  { label: "Report", icon: PlusCircle, path: "/dashboard/student/report" },
  { label: "Claims", icon: FileText, path: "/dashboard/student/claims" },
  { label: "Notifications", shortLabel: "Notification", icon: BellRing, path: "/dashboard/student/notifications" },
  { label: "Profile", icon: User, path: "/dashboard/student/profile" },
];

// Start with an icon rail; retain expansion during client-side navigation.
let sidebarPreference = false;

const desktopQuery = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getDesktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const getServerDesktopSnapshot = () => false;

export function StudentShell({ active, children, userName, userRole, bell, bottomNav = defaultNav, logout }: StudentShellProps) {
  const router = useRouter();
  const desktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getServerDesktopSnapshot);
  useIdleSession(router);
  const [sidebarOpen, setSidebarOpen] = useState(sidebarPreference);
  const [shortcutDockOpen, setShortcutDockOpen] = useState(false);
  const [mobileFabOpen, setMobileFabOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const mobileFabRef = useRef<HTMLDivElement>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [studentUnread, setStudentUnread] = useState(() => getCachedUnread());
  const adminCounts = useAdminNavCounts(userRole);

  useEffect(() => {
    if (userRole !== "STUDENT") return;
    let cancelled = false;
    async function load() {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch("/api/notifications?count=1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.success) {
          setStudentUnread(Number(json.data?.unreadCount || 0));
        }
      } catch {
        // Keep the last known badge if the count request fails.
      }
    }
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const onUpdate = () => void load();
    const interval = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("vaultq:notifications", onUpdate);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("vaultq:notifications", onUpdate);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userRole]);

  function navBadge(label: string) {
    return label === "Claims" ? adminCounts.claims : label === "Intake" ? adminCounts.intake : label === "Notifications" ? studentUnread : 0;
  }

  function badgeText(value: number) {
    return value > 99 ? "99+" : String(value);
  }

  function runQuickAction(action: QuickAction) {
    const target = new URL(action.path, window.location.origin);
    if (userRole === "ADMIN" && target.pathname === window.location.pathname && (target.searchParams.has("add") || target.searchParams.has("edit"))) {
      window.dispatchEvent(new CustomEvent(QUICK_ACTION_EVENT, { detail: action.path }));
    } else {
      router.push(action.path);
    }
    setShortcutDockOpen(false);
    setMobileFabOpen(false);
  }

  useEffect(() => {
    if (!mobileFabOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileFabOpen(false);
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (mobileFabRef.current && !mobileFabRef.current.contains(event.target as Node)) {
        setMobileFabOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePress, true);
    };
  }, [mobileFabOpen]);

  function requestLogout() {
    setConfirmLogout(true);
  }

  async function confirmSignOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    const completed = await endServerSession(localStorage.getItem("token"));
    setLoggingOut(false);
    if (!completed) { showCenteredMessage("error", "Could not complete sign-out. Please try again."); return; }
    setConfirmLogout(false);
    clearClientSession(false);
    logout();
  }

  function toggleSidebar() {
    sidebarPreference = !sidebarOpen;
    setSidebarOpen(sidebarPreference);
  }

  const navItems = bottomNav.map((item) => ({ ...item, active: item.label === active }));
  const desktopNavItems = navItems;
  const quickActions = quickActionsForRole(userRole);
  const activeIndex = navItems.findIndex((item) => item.active);
  const navCount = navItems.length;
  const [indicatorIndex, setIndicatorIndex] = useState(activeIndex);
  const navTimerRef = useRef<number | null>(null);

  // Keep the notch aligned if the active tab changes while the shell stays mounted.
  useEffect(() => {
    // Intentional state sync so the notch can animate to the new route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndicatorIndex(activeIndex);
  }, [activeIndex]);

  useEffect(() => {
    // A bottom-nav change should also dismiss the phone quick actions.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileFabOpen(false);
  }, [active]);

  useEffect(() => () => {
    if (navTimerRef.current) window.clearTimeout(navTimerRef.current);
  }, []);

  // Let the notch glide to the tapped tab before the route changes. Modified
  // clicks keep normal Link behaviour (new tab, etc.).
  function openTab(event: React.MouseEvent<HTMLAnchorElement>, index: number, path?: string) {
    if (!path) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (index === activeIndex) return;
    event.preventDefault();
    setIndicatorIndex(index);
    if (navTimerRef.current) window.clearTimeout(navTimerRef.current);
    navTimerRef.current = window.setTimeout(() => {
      navTimerRef.current = null;
      router.push(path);
    }, 220);
  }

  // Warm the tab routes so the first tap feels immediate (production build;
  // development mode intentionally skips prefetching).
  useEffect(() => {
    for (const item of bottomNav) {
      if (item.path) router.prefetch(item.path);
    }
  }, [router, bottomNav]);

  // Warm the first-tap data while the student dashboard is idle. Prefetching
  // from other tabs would duplicate the request the page is already making.
  useEffect(() => {
    if (userRole !== "STUDENT") return;
    if (window.location.pathname !== "/dashboard/student") return;
    const token = localStorage.getItem("token");
    if (!token) return;
    void prefetchStudentData(token);
  }, [userRole]);

  useEffect(() => {
    if (userRole !== "ADMIN" || window.location.pathname !== "/dashboard/admin") return;
    const token = localStorage.getItem("token");
    if (token) void prefetchAdminData(token);
  }, [userRole]);

  function warmPage(path?: string) {
    if (!path || userRole !== "ADMIN") return;
    const token = localStorage.getItem("token");
    if (token) void prefetchAdminPage(path, token);
  }

  // The desktop shortcut dock stays independent of navigation and page content.

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg }}>
      <CenteredMessageHost />
      <div data-workspace-frame
        className="lg:flex lg:min-h-dvh"
        style={{ backgroundColor: colors.card }}>
      {/* Desktop Sidebar */}
      <aside id="app-sidebar" aria-label="Main navigation"
        className={`hidden lg:flex sticky top-0 h-dvh self-start shrink-0 flex-col z-40 border-r overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none ${sidebarOpen ? "w-64" : "w-[88px]"}`}
        style={{ backgroundColor: colors.card, borderColor: colors.borderLight }}>
        <div className={`shrink-0 flex pt-7 pb-4 ${sidebarOpen ? "items-center gap-3 px-5" : "flex-col items-center gap-5 px-3"}`}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: colors.primarySoft }}>
            <img src="/vaultQ-removebg-preview.png" alt="VaultQ" className="w-8 h-8 object-contain" />
          </div>
          {sidebarOpen && <span className="text-xl font-bold tracking-tight" style={{ color: colors.text }}>VaultQ</span>}
          <button type="button" onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={sidebarOpen} aria-controls="desktop-sidebar-links"
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 ${sidebarOpen ? "ml-auto" : ""}`}
            style={{ color: colors.textMuted }}>
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>
        <nav id="desktop-sidebar-links" aria-label="Desktop navigation" className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2 ${sidebarOpen ? "px-5" : "px-3"}`}>
          {desktopNavItems.map((item, index) => (
            <React.Fragment key={item.label}>
              {sidebarOpen && (index === 0 || item.label === "Profile" || item.label === "Accounts" || (userRole === "ADMIN" && index === 3)) && (
                <p className={`text-[11px] font-medium uppercase tracking-wider px-2 mb-3 ${index === 0 ? "mt-2" : "mt-7"}`}
                  style={{ color: colors.textLight }}>
                  {index === 0 ? "Main menu" : item.label === "Accounts" ? "Admin" : item.label === "Profile" ? "Account" : "Management"}
                </p>
              )}
            <button
              aria-label={item.label}
              aria-current={item.active ? "page" : undefined}
              title={sidebarOpen ? undefined : item.label}
              onPointerEnter={() => warmPage(item.path)}
              onFocus={() => warmPage(item.path)}
              type="button"
              className={`relative flex items-center rounded-full text-sm transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 ${sidebarOpen ? "w-full h-11 gap-3 px-4 mb-1" : "w-14 h-14 justify-center mb-3"} ${item.active ? "font-semibold" : "font-medium"}`}
              style={{
                backgroundColor: item.active ? colors.primary : sidebarOpen ? "transparent" : colors.fill,
                color: item.active ? "#fff" : colors.textMuted,
              }}
              onClick={() => item.path && router.push(item.path)}
              onMouseEnter={(e) => { if (!item.active) e.currentTarget.style.backgroundColor = colors.borderLight; }}
              onMouseLeave={(e) => { if (!item.active) e.currentTarget.style.backgroundColor = sidebarOpen ? "transparent" : colors.fill; }}
            >
              <item.icon size={sidebarOpen ? iconSize.nav : 21} style={{ flexShrink: 0 }} />
              {sidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
              {navBadge(item.label) > 0 && (
                item.label === "Notifications" ? (
                  <span aria-label={`${studentUnread} unread notifications`} title={`${studentUnread} unread notifications`}
                    className={`${sidebarOpen ? "ml-auto" : "absolute right-1 top-1"} w-2.5 h-2.5 rounded-full shrink-0`}
                    style={{ backgroundColor: colors.danger }} />
                ) : (
                  <span className={`${sidebarOpen ? "ml-auto" : "absolute -right-0.5 top-0"} min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center tabular-nums`}
                    style={{ backgroundColor: colors.danger, color: "#fff" }}>
                    {badgeText(navBadge(item.label))}
                  </span>
                )
              )}
            </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="shrink-0 px-3 py-4 border-t" style={{ borderColor: colors.borderLight }}>
          <div className={`flex items-center gap-3 ${sidebarOpen ? "px-2" : "flex-col"}`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: colors.primary }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            {sidebarOpen && <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: colors.text }}>{userName}</p>
              <p className="text-[10px]" style={{ color: colors.textLight }}>{userRole}</p>
            </div>}
            <button type="button" onClick={requestLogout} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors shrink-0 cursor-pointer" style={{ color: colors.textMuted }} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {desktop && (
        <div role="group" aria-label="Quick shortcuts"
          className="fixed bottom-3 right-6 z-40 flex items-center gap-2 rounded-full border p-2 shadow-lg"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}>
          <button type="button" onClick={() => setShortcutDockOpen((open) => !open)}
            aria-label={shortcutDockOpen ? "Collapse quick shortcuts" : "Expand quick shortcuts"}
            aria-expanded={shortcutDockOpen} title={shortcutDockOpen ? "Collapse shortcuts" : "More shortcuts"}
            className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: shortcutDockOpen ? colors.primarySoft : colors.borderLight, color: shortcutDockOpen ? colors.primary : colors.textMuted }}>
            {shortcutDockOpen ? <X size={17} /> : <LayoutGrid size={17} />}
          </button>
          {shortcutDockOpen && quickActions.map((action) => (
            <button key={action.label} type="button" onClick={() => runQuickAction(action)}
              aria-label={action.label} title={action.label}
              className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: colors.borderLight, color: colors.textMuted }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.primarySoft; e.currentTarget.style.color = colors.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = colors.borderLight; e.currentTarget.style.color = colors.textMuted; }}>
              <action.icon size={17} />
            </button>
          ))}
          {shortcutDockOpen && <span aria-hidden="true" className="mx-0.5 h-6 w-px" style={{ backgroundColor: colors.borderLight }} />}
          <ThemeToggle />
          <button type="button" onClick={() => { setShortcutDockOpen(false); setAssistantOpen(true); }}
            aria-label="Open VaultQ assistant" title="VaultQ Assistant" aria-haspopup="dialog"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: colors.primarySoft, color: colors.primary }}>
            <MessageCircle size={18} />
          </button>
        </div>
      )}

      {/* Main area */}
      <div data-workspace-content className="min-w-0 flex-1 flex flex-col"
        style={{ backgroundColor: colors.bg }}>
        {/* Top nav */}
        <header className="sticky top-0 z-30 flex lg:hidden items-center justify-between px-4 py-3 border-b bg-white"
          style={{ borderColor: colors.border, paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-2.5">
            <img src="/vaultQ-removebg-preview.png" alt="" className="w-7 h-7 object-contain lg:hidden" />
            <span className="text-base font-bold lg:hidden" style={{ color: colors.text }}>VaultQ</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setMobileFabOpen(false); setAssistantOpen(true); }}
              aria-label="Open VaultQ assistant" title="VaultQ Assistant" aria-haspopup="dialog"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: colors.primarySoft, color: colors.primary }}>
              <MessageCircle size={18} />
            </button>
            {!desktop && <ThemeToggle />}
            {!desktop && (bell ?? <NotificationBell role={userRole} />)}
            {/* Phone: sign out lives beside the notification bell, no drawer. */}
            <button type="button" onClick={requestLogout} aria-label="Sign out" title="Sign out"
              className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-200"
              style={{ backgroundColor: colors.borderLight }}>
              <LogOut size={17} style={{ color: colors.textMuted }} />
            </button>
          </div>
        </header>

        {children}
      </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white border-t px-1 pt-2"
        style={{
          borderColor: colors.border,
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        }}>
        <div className="relative">
          {activeIndex >= 0 && navCount > 0 && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
              <div
                className="h-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none"
                style={{ width: `${100 / navCount}%`, transform: `translateX(${indicatorIndex * 100}%)`, willChange: "transform" }}>
                <div className="relative mx-auto h-full w-[calc(100%-6px)] rounded-2xl" style={{ backgroundColor: colors.primarySoft }}>
                  <span className="absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ backgroundColor: colors.primary }} />
                </div>
              </div>
            </div>
          )}
          <div className="relative z-10 grid" style={{ gridTemplateColumns: `repeat(${navCount}, minmax(0, 1fr))` }}>
            {navItems.map((item, index) => {
              const content = (
                <>
                  <span className="relative">
                    <item.icon size={20} />
                    {navBadge(item.label) > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center tabular-nums"
                        style={{ backgroundColor: colors.danger, color: "#fff", boxShadow: "0 0 0 2px #fff" }}>
                        {badgeText(navBadge(item.label))}
                      </span>
                    )}
                  </span>
                  <span className="w-full truncate text-center leading-tight"
                    style={{ fontSize: "clamp(8px, 2.35vw, 9.5px)" }}>
                    {item.shortLabel ? (
                      <>
                        <span className="min-[360px]:hidden">{item.shortLabel}</span>
                        <span className="hidden min-[360px]:inline">{item.label}</span>
                      </>
                    ) : item.label}
                  </span>
                </>
              );
              const className = `flex flex-col items-center justify-center gap-0.5 w-full min-w-0 min-h-[44px] px-0.5 py-1 rounded-xl transition-colors duration-200 cursor-pointer touch-manipulation ${item.active ? "font-semibold" : "font-medium"}`;
              const style = { color: item.active ? colors.primary : colors.textLight };
              return item.path ? (
                <Link
                  key={item.label}
                  onPointerEnter={() => warmPage(item.path)}
                  onFocus={() => warmPage(item.path)}
                  onTouchStart={() => warmPage(item.path)}
                  onClick={(event) => openTab(event, index, item.path)}
                  href={item.path}
                  aria-label={item.label}
                  aria-current={item.active ? "page" : undefined}
                  className={className}
                  style={style}
                >
                  {content}
                </Link>
              ) : (
                <button key={item.label} type="button" aria-label={item.label} className={className} style={style}
                  onClick={() => setIndicatorIndex(index)}>
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Phone quick-action FAB: same actions as the desktop shortcut dock,
          without the theme toggle. */}
      {!desktop && (
        <div
          ref={mobileFabRef}
          className="fixed right-4 z-40 flex flex-col items-end gap-2.5 lg:hidden"
          style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
        >
          {mobileFabOpen && (
            <div id="mobile-quick-actions" role="menu" aria-label="Quick actions"
              className="flex flex-col items-end gap-2.5">
              {quickActions.map((action, index) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  onClick={() => runQuickAction(action)}
                  aria-label={action.label}
                  className="animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-2.5 rounded-full cursor-pointer touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ animationDelay: `${index * 35}ms`, outlineColor: colors.primary }}
                >
                  <span className="max-w-[10.5rem] truncate rounded-full border bg-white px-3 py-1.5 text-[11px] font-semibold shadow-md"
                    style={{ borderColor: colors.border, color: colors.text }}>
                    {action.label}
                  </span>
                  <span className="w-12 h-12 shrink-0 rounded-full border bg-white flex items-center justify-center shadow-lg"
                    style={{ borderColor: colors.border, color: colors.primary }}>
                    <action.icon size={19} />
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setMobileFabOpen((open) => !open)}
            aria-label={mobileFabOpen ? "Close quick actions" : "Open quick actions"}
            aria-expanded={mobileFabOpen}
            aria-haspopup="menu"
            aria-controls={mobileFabOpen ? "mobile-quick-actions" : undefined}
            className="w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-white cursor-pointer touch-manipulation transition-transform duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: colors.primary,
              boxShadow: "0 8px 20px rgba(47,85,128,0.28)",
              outlineColor: colors.primary,
            }}
          >
            <Plus
              size={24}
              className="transition-transform duration-200"
              style={{ transform: mobileFabOpen ? "rotate(45deg)" : "none" }}
            />
          </button>
        </div>
      )}

      {assistantOpen && <GuidedAssistant role={userRole} onClose={() => setAssistantOpen(false)} />}

      {/* Logout confirm dialog */}
      <ConfirmDialog
        open={confirmLogout}
        title="Are you sure you want to log out?"
        subtitle="You can sign back in anytime to access your reports, claims and notifications."
        icon="logout"
        tone="primary"
        cancelLabel="Stay logged in"
        confirmLabel={loggingOut ? "Logging out…" : "Log out"}
        busy={loggingOut}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => void confirmSignOut()}
      />
    </div>
  );
}
