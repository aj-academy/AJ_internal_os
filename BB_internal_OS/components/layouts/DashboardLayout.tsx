"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar, type SidebarItem } from "@/components/layouts/Sidebar";
import { Topbar } from "@/components/layouts/Topbar";

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

  const mobileMenuTrigger: ReactNode = (
    <SheetTrigger
      render={
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="touch-target shrink-0 rounded-full border-[#d4deea] bg-white text-[#1e3a8a] lg:hidden"
          aria-label="Open navigation menu"
        />
      }
    >
      <Menu className="h-5 w-5" />
    </SheetTrigger>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div className="min-h-[100dvh] min-w-0 bg-[#eaf1f8] text-[#1e293b]">
        <div
          className={[
            "hidden lg:fixed lg:inset-y-0 lg:z-30 lg:block lg:p-4 lg:pr-0 lg:transition-all lg:duration-200 lg:ease-out",
            collapsed ? "lg:w-[92px]" : "lg:w-[270px]",
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
            "min-w-0 lg:pr-4 lg:transition-all lg:duration-200 lg:ease-out",
            collapsed ? "lg:pl-[92px]" : "lg:pl-[270px]",
          ].join(" ")}
        >
          <Topbar
            fullName={userName}
            email={userEmail}
            notificationFallbackHref={notificationFallbackHref}
            mobileMenuTrigger={mobileMenuTrigger}
          />

          <main className="mx-auto min-h-0 w-full max-w-[1920px] px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:px-4 lg:px-6 lg:pb-8">
            {children}
          </main>
        </div>

        <SheetContent
          side="left"
          showCloseButton
          className="w-[min(100vw-1rem,288px)] max-w-[100vw] border-none bg-[#eaf1f8] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))]"
        >
          <Sidebar
            roleLabel={roleLabel}
            items={sidebarItems}
            collapsed={false}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </div>
    </Sheet>
  );
}
