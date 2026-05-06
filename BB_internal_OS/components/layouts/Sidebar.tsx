"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutGrid,
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

export const Sidebar = memo(function Sidebar({ items, collapsed = false, onToggleCollapse, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
  const [attendanceExpanded, setAttendanceExpanded] = useState(pathname.startsWith("/admin/attendance"));
  const getIcon = (label: string) => {
    if (label.includes("Attendance")) return UserCheck;
    if (label.includes("Employee")) return UsersRound;
    if (label.includes("Client")) return BriefcaseBusiness;
    if (label.includes("Project")) return ClipboardList;
    if (label.includes("Task")) return ClipboardList;
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
          const isActive = pathname === item.href;
          const hasChildren = Boolean(item.children?.length);
          const hasActiveChild =
            hasChildren &&
            item.children!.some((child) => {
              const url = new URL(child.href, "http://localhost");
              return pathname === url.pathname && activeTab === (url.searchParams.get("tab") ?? "overview");
            });
          const isAttendanceMenu = item.label === "Attendance System";
          const isExpanded = !collapsed && hasChildren && (isAttendanceMenu ? attendanceExpanded : isActive || hasActiveChild);
          const Icon = getIcon(item.label);

          return (
            <div key={item.href} className="space-y-1">
              <Link
                href={item.href}
                onClick={(event) => {
                  if (hasChildren && isAttendanceMenu && pathname.startsWith("/admin/attendance")) {
                    event.preventDefault();
                    setAttendanceExpanded((prev) => !prev);
                    return;
                  }
                  onNavigate?.();
                }}
                className={cn(
                  "group flex items-center justify-between rounded-full px-3 py-2.5 text-sm font-medium transition-all duration-300 ease-out hover:bg-white hover:text-[#1e3a8a]",
                  isActive || hasActiveChild
                    ? "text-white"
                    : "text-[#dbeafe]",
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={cn(
                      "h-4 w-4 text-white transition-colors duration-200",
                      isActive || hasActiveChild ? "text-white group-hover:text-[#1e3a8a]" : "text-white group-hover:text-[#1e3a8a]",
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
                      pathname === childUrl.pathname &&
                      activeTab === (childUrl.searchParams.get("tab") ?? "overview");
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-xs transition-colors duration-200",
                          childIsActive
                            ? "font-semibold text-white"
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
