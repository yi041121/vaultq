"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Search, PlusCircle, FileText, BellRing, User, Menu, X, LogOut } from "lucide-react";
import { colors, iconSize } from "@/lib/design";
import CenteredMessageHost from "@/components/centered-message";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { useAdminNavCounts } from "@/lib/use-admin-nav-counts";
import { prefetchStudentData } from "@/lib/student-cache";
import { useIdleSession } from "@/lib/use-idle-session";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const adminCounts = useAdminNavCounts(userRole);

  function navBadge(label: string) {
    return label === "Claims" ? adminCounts.claims : label === "Intake" ? adminCounts.intake : 0;
  }

  function badgeText(value: number) {
    return value > 99 ? "99+" : String(value);
  }

  function requestLogout() {
    setSidebarOpen(false);
    setConfirmLogout(true);
  }

  const navItems = bottomNav.map((item) => ({ ...item, active: item.label === active }));

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
    const timer = window.setTimeout(() => void prefetchStudentData(token), 400);
    return () => window.clearTimeout(timer);
  }, [userRole]);

  // The mobile drawer overlays the page, so freeze the page behind it and
  // allow Escape to close it like a normal dialog.
  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sidebarOpen]);

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
          <div className="flex items-center gap-3">
            <button aria-label="Open navigation" className="lg:hidden cursor-pointer -ml-2 p-2 rounded-lg" style={{ color: colors.textMuted }} onClick={() => setSidebarOpen(true)}>
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2.5 lg:hidden">
              <img src="/vaultQ-removebg-preview.png" alt="" className="w-7 h-7 object-contain" />
              <span className="text-base font-bold" style={{ color: colors.text }}>VaultQ</span>
            </div>
          </div>
          {pageTitle && (
            <h1 className="hidden lg:block text-lg font-bold absolute left-1/2 -translate-x-1/2" style={{ color: colors.text }}>{pageTitle}</h1>
          )}
          <div className="flex items-center gap-3">
            {bell ?? <NotificationBell role={userRole} />}
          </div>
        </header>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <aside className="absolute left-0 top-0 bottom-0 w-56 flex flex-col" style={{ backgroundColor: colors.sidebar }}>
              <div className="flex items-center justify-between px-5 py-5 border-b" style={{ borderColor: colors.sidebarBorder }}>
                <div className="flex items-center gap-3">
                  <img src="/vaultQ-removebg-preview.png" alt="" className="w-8 h-8 object-contain" />
                  <span className="text-lg font-bold text-white">VaultQ</span>
                </div>
                <button aria-label="Close navigation" className="text-white/60 hover:text-white cursor-pointer" onClick={() => setSidebarOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 px-2 py-3 space-y-0.5">
                {navItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 cursor-pointer ${item.active ? "font-semibold" : "font-medium"}`}
                    style={{
                      backgroundColor: item.active ? "rgba(127,184,181,0.14)" : "transparent",
                      color: item.active ? "#fff" : colors.sidebarText,
                    }}
                    onClick={() => { setSidebarOpen(false); if (item.path) router.push(item.path); }}
                  >
                    {item.active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full" style={{ backgroundColor: colors.accent }} />
                    )}
                    <item.icon size={iconSize.nav} style={{ color: item.active ? colors.accent : undefined, flexShrink: 0 }} />
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
                <button onClick={requestLogout} className="flex items-center gap-3 px-3 py-2.5 w-full text-sm cursor-pointer"
                  style={{ color: colors.sidebarText }}>
                  <LogOut size={18} />
                  <span>Sign out</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {children}
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white border-t grid px-1 pt-2"
        style={{
          borderColor: colors.border,
          gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        }}>
        {navItems.map((item) => {
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
              <span className="w-full truncate text-center font-medium leading-tight"
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
          const className = "flex flex-col items-center justify-center gap-0.5 w-full min-w-0 min-h-[44px] px-0.5 py-1 rounded-xl transition-colors duration-200 cursor-pointer touch-manipulation";
          const style = {
            color: item.active ? colors.primary : colors.textLight,
            backgroundColor: item.active ? `${colors.primary}12` : "transparent",
          };
          return item.path ? (
            <Link
              key={item.label}
              href={item.path}
              aria-label={item.label}
              aria-current={item.active ? "page" : undefined}
              className={className}
              style={style}
            >
              {content}
            </Link>
          ) : (
            <button key={item.label} type="button" aria-label={item.label} className={className} style={style}>
              {content}
            </button>
          );
        })}
      </nav>

      {/* Logout confirm dialog */}
      <ConfirmDialog
        open={confirmLogout}
        title="Log out?"
        subtitle="You will need to sign in again to access your account."
        confirmLabel="Log out"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); logout(); }}
      />
    </div>
  );
}
