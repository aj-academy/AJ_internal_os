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

export const Sidebar = memo(function Sidebar({ items, collapsed = false, onToggleCollapse, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const pathNorm = normalizeRoutePath(pathname);
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
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
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-r-[24px] rounded-l-[20px] border border-[#d4b84a]/80 bg-gradient-to-b from-[#d4b84a] via-[#c9a227] to-[#a68b2e] shadow-[0_18px_45px_rgba(166,139,46,0.28)] transition-all duration-200 ease-out">
      <div className="flex items-center justify-between gap-2 px-4 py-5">
        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/95 p-0.5 shadow-sm">
              <AppLogo size={32} className="h-8 w-8" priority />
            </span>
            <p className="truncate text-base font-semibold text-white">AJ Academy</p>
          </div>
        ) : (
          <span className="mx-auto inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white/95 p-0.5 shadow-sm">
            <AppLogo size={32} className="h-8 w-8" priority />
          </span>
        )}
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden rounded-full p-1.5 text-white/90 transition-colors duration-200 hover:bg-white/20 hover:text-white lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-3 pb-4">
        {uniqueItems.map((item) => {
          const isActive = pathNorm === routePathOnly(item.href);
          const hasChildren = Boolean(item.children?.length);
          const hasActiveChild =
            hasChildren &&
            item.children!.some((child) => {
              const url = new URL(child.href, "http://localhost");
              return pathNorm === normalizeRoutePath(url.pathname) && activeTab === (url.searchParams.get("tab") ?? "overview");
            });
          const isExpanded = !collapsed && hasChildren && (isActive || hasActiveChild);
          const Icon = getIcon(item.label);

          return (
            <div key={item.href} className="space-y-1">
              <Link
                href={toLinkHref(item.href)}
                onClick={() => onNavigate?.()}
                className={cn(
                  "group flex items-center justify-between rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out",
                  isActive
                    ? "bg-[#fffdf8] text-[#3d3428] shadow-md"
                    : hasActiveChild
                      ? "bg-white/15 text-white"
                      : "text-white/90 hover:bg-[#fffdf8] hover:text-[#3d3428]",
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors duration-200",
                      isActive ? "text-[#c9a227]" : "text-white group-hover:text-[#c9a227]",
                    )}
                  />
                  <span
                    className={cn(
                      "origin-left whitespace-nowrap transition-all duration-300 ease-in-out",
                      collapsed ? "w-0 scale-95 opacity-0" : "w-auto scale-100 opacity-100",
                    )}
                  >
                    {item.label}
                  </span>
                </span>
                {!collapsed && hasChildren ? (
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-white/70 transition-transform",
                      isExpanded ? "rotate-180" : "rotate-0",
                    )}
                  />
                ) : null}
              </Link>
              {isExpanded && hasChildren ? (
                <div className="ml-8 space-y-1 border-l border-white/25 pl-3">
                  {item.children!.map((child) => {
                    const childUrl = new URL(child.href, "http://localhost");
                    const childIsActive =
                      pathNorm === normalizeRoutePath(childUrl.pathname) &&
                      activeTab === (childUrl.searchParams.get("tab") ?? "overview");
                    return (
                      <Link
                        key={child.href}
                        href={toLinkHref(child.href)}
                        onClick={onNavigate}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-xs transition-colors duration-200",
                          childIsActive
                            ? "bg-white/20 font-semibold text-white"
                            : "text-white/80 hover:bg-white/15 hover:text-white",
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
