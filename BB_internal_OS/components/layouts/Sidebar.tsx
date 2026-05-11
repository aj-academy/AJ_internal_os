"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  Settings,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Wallet,
} from "lucide-react";
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

/** Strip trailing slash so `/employee/leave/` matches config `/employee/leave`. */
function normalizeRoutePath(p: string | null) {
  if (!p) return "";
  const trimmed = p.replace(/\/$/, "");
  return trimmed || "/";
}

/**
 * Use a pathname object for simple app routes so client navigations do not keep a
 * stale hash (e.g. old `#my-leave`) that would otherwise stick on the next page.
 */
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
    if (label.includes("Attendance")) return UserCheck;
    if (label.includes("Employee")) return UsersRound;
    if (label.includes("Client")) return BriefcaseBusiness;
    if (label.includes("Project")) return FolderKanban;
    if (label.includes("Task")) return ListChecks;
    if (label.includes("Finance")) return Wallet;
    if (label.includes("Policies")) return ShieldCheck;
    if (label.includes("Reports")) return BarChart3;
    if (label.includes("Settings")) return Settings;
    if (label.includes("Dashboard")) return LayoutGrid;
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
    <aside className="flex h-full w-full flex-col overflow-hidden rounded-r-[24px] rounded-l-[20px] border border-[#274b8f] bg-gradient-to-b from-[#1d4e89] to-[#1e3a8a] shadow-[0_18px_45px_rgba(30,58,138,0.35)] transition-all duration-200 ease-out">
      <div className="flex items-center justify-between px-4 py-5">
        {!collapsed ? <p className="text-base font-semibold text-white">BB Internal OS</p> : <span className="mx-auto text-sm font-semibold text-white">BB</span>}
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden rounded-full p-1.5 text-[#dbeafe] transition-colors duration-200 hover:bg-[#2b5cb0] hover:text-white lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1.5 p-3">
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
                  "group flex items-center justify-between rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-300 ease-out",
                  isActive
                    ? "bg-white text-[#1e3a8a] shadow-sm"
                    : hasActiveChild
                      ? "bg-white/12 text-white hover:bg-white/20"
                      : "text-[#dbeafe] hover:bg-white hover:text-[#1e3a8a]",
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4 transition-colors duration-200",
                      isActive
                        ? "text-[#1e3a8a]"
                        : "text-white group-hover:text-[#1e3a8a]",
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
                      "h-4 w-4 text-[#bfdbfe] transition-transform",
                      isExpanded ? "rotate-180" : "rotate-0",
                    )}
                  />
                ) : null}
              </Link>
              {isExpanded && hasChildren ? (
                <div className="ml-8 space-y-1 border-l border-[#4d74b8] pl-3">
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
                            ? "bg-white/15 font-semibold text-white"
                            : "text-[#cfe0ff] hover:bg-[#2b5cb0] hover:text-white",
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
