"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar, type SidebarItem } from "@/components/layouts/Sidebar";
import { Topbar } from "@/components/layouts/Topbar";
import { useSystemPreferences } from "@/hooks/useSystemPreferences";

interface DashboardLayoutProps {
  roleLabel: string;
  sidebarItems: SidebarItem[];
  userName: string;
  userEmail: string;
  /** Default "Open" link for task-related notifications when link_path is null. */
  notificationFallbackHref: string;
  children: React.ReactNode;
}

export function DashboardLayout({
  roleLabel,
  sidebarItems,
  userName,
  userEmail,
  notificationFallbackHref,
  children,
}: DashboardLayoutProps) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapseHydrated, setCollapseHydrated] = useState(false);
  const { preferences, loading: prefsLoading } = useSystemPreferences();

  useEffect(() => {
    if (prefsLoading || collapseHydrated) return;
    setCollapsed(preferences.sidebarCollapsed);
    setCollapseHydrated(true);
  }, [prefsLoading, preferences.sidebarCollapsed, collapseHydrated]);

  useEffect(() => {
    if (prefsLoading) return;
    const root = document.documentElement;
    if (preferences.theme === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
    }
  }, [prefsLoading, preferences.theme]);

  const mobileMenuTrigger: ReactNode = (
    <SheetTrigger
      render={
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="touch-target shrink-0 rounded-xl border-[#e8dcc8] bg-white text-[#a68b2e] lg:hidden"
          aria-label="Open navigation menu"
        />
      }
    >
      <Menu className="h-5 w-5" />
    </SheetTrigger>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div
        data-theme={preferences.theme}
        className={[
          "min-h-[100dvh] min-w-0 overflow-x-hidden text-[#3d3428]",
          preferences.theme === "dark" ? "aj-shell-dark bg-[#0f172a] text-[#e2e8f0]" : "bg-[#fffdf8]",
        ].join(" ")}
      >
        <div
          className={[
            "hidden lg:fixed lg:inset-y-0 lg:z-30 lg:block lg:p-3 lg:pr-0 lg:transition-all lg:duration-200 lg:ease-out xl:p-4 xl:pr-0",
            collapsed ? "lg:w-[88px]" : "lg:w-[268px]",
          ].join(" ")}
        >
          <Sidebar
            roleLabel={roleLabel}
            items={sidebarItems}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((prev) => !prev)}
          />
        </div>

        <div
          className={[
            "min-w-0 lg:pr-3 lg:transition-all lg:duration-200 lg:ease-out xl:pr-4",
            collapsed ? "lg:pl-[88px]" : "lg:pl-[268px]",
          ].join(" ")}
        >
          <Topbar
            fullName={userName}
            email={userEmail}
            notificationFallbackHref={notificationFallbackHref}
            mobileMenuTrigger={mobileMenuTrigger}
          />

          <main className="mx-auto min-h-0 w-full max-w-[1920px] min-w-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pt-4 lg:px-6 lg:pb-8 lg:pt-5">
            <div className="aj-page">{children}</div>
          </main>
        </div>

        <SheetContent
          side="left"
          showCloseButton={false}
          className="h-[100dvh] max-h-[100dvh] w-[min(100vw,300px)] max-w-[100vw] border-none bg-transparent p-0 shadow-none"
        >
          <div className="relative flex h-full min-h-0 flex-col p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))]">
            <SheetClose
              render={
                <button
                  type="button"
                  aria-label="Close menu"
                  className="sidebar-sheet-close group"
                />
              }
            >
              <X className="h-5 w-5 transition-transform duration-200 group-hover:rotate-90" />
            </SheetClose>
            <div className="min-h-0 flex-1 overflow-hidden">
              <Sidebar
                roleLabel={roleLabel}
                items={sidebarItems}
                collapsed={false}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </SheetContent>
      </div>
    </Sheet>
  );
}
