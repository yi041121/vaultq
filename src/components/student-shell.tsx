"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Search, PlusCircle, FileText, BellRing, User, MoreVertical, LogOut } from "lucide-react";
import { colors, iconSize } from "@/lib/design";
import CenteredMessageHost from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAdminNavCounts } from "@/lib/use-admin-nav-counts";
import { prefetchStudentData } from "@/lib/student-cache";
import { useIdleSession } from "@/lib/use-idle-session";
import { clearClientSession } from "@/lib/idle-session";
import { prefetchAdminData, prefetchAdminPage } from "@/lib/admin-data";
import { useEscapeKey } from "@/lib/use-escape-key";

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

export function StudentShell({ active, children, userName, userRole, pageTitle, bell, bottomNav = defaultNav, logout }: StudentShellProps) {
  const router = useRouter();
  useIdleSession(router);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const adminCounts = useAdminNavCounts(userRole);

  function navBadge(label: string) {
    return label === "Claims" ? adminCounts.claims : label === "Intake" ? adminCounts.intake : 0;
  }

  function badgeText(value: number) {
    return value > 99 ? "99+" : String(value);
  }

  function requestLogout() {
    setAccountMenuOpen(false);
    setConfirmLogout(true);
  }

  const navItems = bottomNav.map((item) => ({ ...item, active: item.label === active }));
  const activeIndex = navItems.findIndex((item) => item.active);
  const navCount = navItems.length;
  const [indicatorIndex, setIndicatorIndex] = useState(activeIndex);
  const navTimerRef = useRef<number | null>(null);

  useEscapeKey(accountMenuOpen, () => setAccountMenuOpen(false));

  useEffect(() => {
    if (!accountMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [accountMenuOpen]);

  // Keep the notch aligned if the active tab changes while the shell stays mounted.
  useEffect(() => {
    setIndicatorIndex(activeIndex);
  }, [activeIndex]);

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

  // The mobile header keeps its actions inline, so there is no drawer to lock
  // the page behind. The desktop account menu closes on escape/outside click above.

  return (
    <div className="min-h-screen" style={{ backgroundColor: colors.bg }}>
      <CenteredMessageHost />
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-56 flex-col z-40" style={{ backgroundColor: colors.sidebar }}>
        <div className="px-5 py-5 border-b flex items-center gap-3" style={{ borderColor: colors.sidebarBorder }}>
          <img src="/vaultQ-removebg-preview.png" alt="" className="w-8 h-8 object-contain" />
          <span className="text-lg font-bold text-white">VaultQ</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1.5">
          {navItems.map((item) => (
            <button
              key={item.label}
              onPointerEnter={() => warmPage(item.path)}
              onFocus={() => warmPage(item.path)}
              type="button"
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 cursor-pointer ${item.active ? "font-semibold" : "font-medium"}`}
              style={{
                backgroundColor: item.active ? "rgba(127,184,181,0.14)" : "transparent",
                color: item.active ? "#fff" : colors.sidebarText,
              }}
              onClick={() => item.path && router.push(item.path)}
              onMouseEnter={(e) => { if (!item.active) { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = colors.sidebarTextHover; } }}
              onMouseLeave={(e) => { if (!item.active) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = colors.sidebarText; } }}
            >
              {item.active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full" style={{ backgroundColor: colors.accent }} />
              )}
              <item.icon size={iconSize.nav} style={{ color: item.active ? colors.accent : undefined, flexShrink: 0, opacity: item.active ? 1 : 0.9 }} />
              <span>{item.label}</span>
              {navBadge(item.label) > 0 && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold flex items-center justify-center tabular-nums"
                  style={{ backgroundColor: "rgba(220,38,38,0.18)", color: "#fecaca", boxShadow: "inset 0 0 0 1px rgba(248,113,113,0.35)" }}>
                  {badgeText(navBadge(item.label))}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t" style={{ borderColor: colors.sidebarBorder }}>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ backgroundColor: colors.primary }}>
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userName}</p>
              <p className="text-xs" style={{ color: colors.sidebarText }}>{userRole}</p>
            </div>
            <button onClick={requestLogout} className="text-white/40 hover:text-white transition-colors shrink-0 cursor-pointer" aria-label="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="lg:ml-56 flex flex-col">
        {/* Top nav */}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 lg:px-8 py-3 border-b bg-white relative"
          style={{ borderColor: colors.border, paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-2.5">
            <img src="/vaultQ-removebg-preview.png" alt="" className="w-7 h-7 object-contain lg:hidden" />
            <span className="text-base font-bold lg:hidden" style={{ color: colors.text }}>VaultQ</span>
          </div>
          {pageTitle && (
            <h1 className="hidden lg:block text-lg font-bold absolute left-1/2 -translate-x-1/2" style={{ color: colors.text }}>{pageTitle}</h1>
          )}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {bell ?? <NotificationBell role={userRole} />}
            {/* Phone: sign out lives beside the notification bell, no drawer. */}
            <button type="button" onClick={requestLogout} aria-label="Sign out" title="Sign out"
              className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-200"
              style={{ backgroundColor: colors.borderLight }}>
              <LogOut size={17} style={{ color: colors.textMuted }} />
            </button>
            {/* Desktop: compact 3-dot account menu. */}
            <div ref={accountMenuRef} className="relative hidden lg:block">
              <button type="button" onClick={() => setAccountMenuOpen((open) => !open)}
                aria-label="Account menu" title="Account menu"
                aria-haspopup="menu" aria-expanded={accountMenuOpen}
                className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors duration-200"
                style={{ backgroundColor: accountMenuOpen ? colors.primarySoft : colors.borderLight }}>
                <MoreVertical size={18} style={{ color: accountMenuOpen ? colors.primary : colors.textMuted }} />
              </button>
              {accountMenuOpen && (
                <div role="menu" aria-label="Account menu"
                  className="absolute right-0 top-12 z-50 w-60 origin-top-right overflow-hidden rounded-xl border bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150"
                  style={{ borderColor: colors.border }}>
                  <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: colors.borderLight }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ backgroundColor: colors.primary }}>
                      {userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" style={{ color: colors.text }}>{userName}</p>
                      <p className="text-[11px]" style={{ color: colors.textMuted }}>{userRole}</p>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <button type="button" role="menuitem"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        router.push(userRole === "ADMIN" ? "/dashboard/admin/accounts" : "/dashboard/student/profile");
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors duration-150 hover:bg-[#f8fafc]"
                      style={{ color: colors.text }}>
                      <User size={15} style={{ color: colors.textMuted }} />
                      {userRole === "ADMIN" ? "Manage accounts" : "My profile"}
                    </button>
                    <button type="button" role="menuitem" onClick={requestLogout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors duration-150 hover:bg-[#fef2f2]"
                      style={{ color: colors.danger }}>
                      <LogOut size={15} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {children}
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

      {/* Logout confirm dialog */}
      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        subtitle="You will need to sign in again to access your account."
        confirmLabel="Log out"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); clearClientSession(); logout(); }}
      />
    </div>
  );
}
