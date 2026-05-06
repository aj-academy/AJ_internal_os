"use client";

import { useState } from "react";
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
  children: React.ReactNode;
}

export function DashboardLayout({
  roleLabel,
  sidebarItems,
  userName,
  userEmail,
  children,
}: DashboardLayoutProps) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-[#eaf1f8] text-[#1e293b]">
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
          "lg:pr-4 lg:transition-all lg:duration-200 lg:ease-out",
          collapsed ? "lg:pl-[92px]" : "lg:pl-[270px]",
        ].join(" ")}
      >
        <div className="flex h-16 items-center bg-[#eaf1f8] px-4 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full border-[#d4deea] bg-white text-[#1e3a8a]"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[270px] border-none bg-[#eaf1f8] p-3">
              <Sidebar
                roleLabel={roleLabel}
                items={sidebarItems}
                collapsed={false}
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>

        <Topbar fullName={userName} email={userEmail} />

        <main className="px-4 pb-6 pt-2 lg:px-6 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}
