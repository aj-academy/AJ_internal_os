"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderKanban,
  FolderOpen,
  Handshake,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  Settings,
  ShieldCheck,
  User,
  UserCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
import { AppLogo } from "@/components/branding/AppLogo";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  label: string;
  href: string;
  children?: SidebarItem[];
}

interface SidebarProps {
  roleLabel: string;
  items: SidebarItem[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}

function normalizeRoutePath(p: string | null) {
  if (!p) return "";
  const trimmed = p.replace(/\/$/, "");
  return trimmed || "/";
}

function toLinkHref(href: string): string | { pathname: string } {
  try {
    const u = new URL(href, "https://example.com");
    if (u.search || u.hash) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
    return { pathname: u.pathname || "/" };
  } catch {
    return href;
  }
}

function routePathOnly(href: string) {
  try {
    return normalizeRoutePath(new URL(href, "https://example.com").pathname);
  } catch {
    return normalizeRoutePath(href);
  }
}

/** True when current location matches this nav link (path + optional ?tab=). */
function isNavLinkActive(
  href: string,
  pathNorm: string,
  activeTab: string | null,
): boolean {
  try {
    const url = new URL(href, "https://example.com");
    const linkPath = normalizeRoutePath(url.pathname);
    const pathMatches = pathNorm === linkPath || pathNorm.startsWith(`${linkPath}/`);
    if (!pathMatches) return false;

    // Only enforce tab when the link itself specifies ?tab=
    const linkTab = url.searchParams.get("tab");
    if (linkTab != null) {
      return (activeTab ?? "overview") === linkTab;
    }
    return true;
  } catch {
    return pathNorm === routePathOnly(href);
  }
}

/**
 * Keep parent accordion open for any sibling under the same section folder
 * e.g. /admin/students/directory and /admin/students/bulk-import.
 */
function isUnderNavSection(item: SidebarItem, pathNorm: string, activeTab: string | null): boolean {
  if (!item.children?.length) return false;
  if (item.children.some((child) => isNavLinkActive(child.href, pathNorm, activeTab))) {
    return true;
  }
  // Sibling pages sharing the same first two path segments as any child
  return item.children.some((child) => {
    const childPath = routePathOnly(child.href);
    const childParts = childPath.split("/").filter(Boolean);
    const pathParts = pathNorm.split("/").filter(Boolean);
    if (childParts.length < 2 || pathParts.length < 2) return false;
    return childParts[0] === pathParts[0] && childParts[1] === pathParts[1];
  });
}

export const Sidebar = memo(function Sidebar({ items, collapsed = false, onToggleCollapse, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const pathNorm = normalizeRoutePath(pathname);
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab");
  const getIcon = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes("attendance")) return UserCheck;
    if (l.includes("counselling")) return MessageCircle;
    if (l.includes("leave") || l.includes("permission")) return CalendarDays;
    if (l.includes("profile")) return User;
    if (l.includes("user") || l.includes("employee")) return UsersRound;
    if (l.includes("client") || l.includes("lead")) return BriefcaseBusiness;
    if (l.includes("portfolio")) return FolderOpen;
    if (l.includes("project")) return FolderKanban;
    if (l.includes("task")) return ListChecks;
    if (l.includes("reimbursement")) return Wallet;
    if (l.includes("finance")) return Wallet;
    if (l.includes("freelance")) return Handshake;
    if (l.includes("policies")) return ShieldCheck;
    if (l.includes("reports")) return BarChart3;
    if (l.includes("settings")) return Settings;
    if (l.includes("dashboard")) return LayoutGrid;
    return FileText;
  };

  const uniqueItems = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter((item) => {
        const key = `${item.label}::${item.href}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => {
        if (!item.children?.length) return item;
        const childSeen = new Set<string>();
        return {
          ...item,
          children: item.children.filter((child) => {
            const key = `${child.label}::${child.href}`;
            if (childSeen.has(key)) return false;
            childSeen.add(key);
            return true;
          }),
        };
      });
  }, [items]);

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-[1.25rem] border border-[#d4b84a]/70 bg-gradient-to-b from-[#d4b84a] via-[#c9a227] to-[#a68b2e] shadow-[0_12px_36px_rgba(166,139,46,0.22)] transition-all duration-200 ease-out">
      <div className="flex items-center justify-between gap-2 px-3.5 py-4 sm:px-4">
        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/95 p-0.5 shadow-sm">
              <AppLogo size={32} className="h-8 w-8" priority />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-semibold tracking-tight text-white">AJ Academy</p>
              <p className="truncate text-[0.625rem] font-medium uppercase tracking-[0.12em] text-white/70">
                Internal OS
              </p>
            </div>
          </div>
        ) : (
          <span className="mx-auto inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white/95 p-0.5 shadow-sm">
            <AppLogo size={32} className="h-8 w-8" priority />
          </span>
        )}
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden rounded-xl p-2 text-white/90 transition-colors duration-200 hover:bg-white/20 hover:text-white lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2.5 pb-4 sm:px-3">
        {uniqueItems.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const hasActiveChild = hasChildren && isUnderNavSection(item, pathNorm, activeTab);
          const isExactParent = pathNorm === routePathOnly(item.href);
          const isActive = hasChildren ? hasActiveChild || isExactParent : isExactParent;
          const isExpanded = !collapsed && hasChildren && (hasActiveChild || isExactParent);
          const Icon = getIcon(item.label);

          return (
            <div key={`${item.label}::${item.href}`} className="space-y-1">
              <Link
                href={toLinkHref(item.href)}
                onClick={() => onNavigate?.()}
                className={cn(
                  "group flex min-h-11 items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out sm:min-h-10",
                  isActive && !hasChildren
                    ? "bg-[#fffdf8] text-[#3d3428] shadow-[0_4px_14px_rgba(61,52,40,0.12)]"
                    : hasActiveChild || (hasChildren && isExactParent)
                      ? "bg-white/15 text-white"
                      : "text-white/92 hover:bg-white/15 hover:text-white",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors duration-200",
                      isActive && !hasChildren ? "text-[#c9a227]" : "text-white/95 group-hover:text-white",
                    )}
                  />
                  <span
                    className={cn(
                      "origin-left truncate whitespace-nowrap transition-all duration-300 ease-in-out",
                      collapsed ? "w-0 scale-95 opacity-0" : "w-auto scale-100 opacity-100",
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                {!collapsed && hasChildren ? (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-white/70 transition-transform",
                      isExpanded ? "rotate-180" : "rotate-0",
                    )}
                  />
                ) : null}
              </Link>
              {isExpanded && hasChildren ? (
                <div className="ml-4 space-y-0.5 border-l border-white/25 pl-3 sm:ml-5">
                  {item.children!.map((child) => {
                    const childIsActive = isNavLinkActive(child.href, pathNorm, activeTab);
                    return (
                      <Link
                        key={`${child.label}::${child.href}`}
                        href={toLinkHref(child.href)}
                        onClick={onNavigate}
                        className={cn(
                          "block rounded-lg px-2.5 py-2 text-xs font-medium transition-colors duration-200",
                          childIsActive
                            ? "bg-white/22 font-semibold text-white"
                            : "text-white/80 hover:bg-white/12 hover:text-white",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
});
