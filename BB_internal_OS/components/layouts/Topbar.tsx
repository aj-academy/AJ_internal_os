"use client";

import { memo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { InAppNotificationsBell } from "@/components/layouts/InAppNotificationsBell";

interface TopbarProps {
  fullName: string;
  email: string;
  notificationFallbackHref: string;
  /** Global search in topbar — hidden on dashboards until wired up. */
  showSearchBar?: boolean;
  /** Shown only below `lg` (mobile / tablet). Typically a `SheetTrigger` for the sidebar. */
  mobileMenuTrigger?: ReactNode;
}

export const Topbar = memo(function Topbar({
  fullName,
  email,
  notificationFallbackHref,
  showSearchBar = false,
  mobileMenuTrigger,
}: TopbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-[#d4deea]/60 bg-[#eaf1f8]/90 px-3 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-[#eaf1f8]/75 sm:px-4 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3">
        <div className="flex items-start gap-2 sm:gap-3">
          {mobileMenuTrigger ? <div className="shrink-0 pt-0.5 lg:hidden">{mobileMenuTrigger}</div> : null}

          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-semibold text-[#1f2937]">BB Internal OS</p>
            <p className="truncate text-xs text-[#64748b] sm:max-w-none">
              <span className="font-medium text-[#334155]">{fullName}</span>
              <span className="text-[#94a3b8]"> · </span>
              <span className="break-all sm:break-normal">{email}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <InAppNotificationsBell fallbackTaskHref={notificationFallbackHref} />
            <Button
              type="button"
              size="icon"
              className="touch-target hidden rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8] sm:inline-flex"
              aria-label="Quick create"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Avatar className="h-9 w-9 shrink-0 border border-[#d4deea] bg-white sm:h-10 sm:w-10">
              <AvatarFallback className="bg-[#e0eaff] text-xs text-[#1d4ed8] sm:text-sm">
                {fullName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="touch-target hidden gap-2 rounded-full border-[#d4deea] bg-white px-3 text-[#1f2937] hover:bg-[#eef4ff] sm:inline-flex sm:px-4"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleLogout}
              className="touch-target rounded-full border-[#d4deea] bg-white text-[#1e3a8a] sm:hidden"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showSearchBar ? (
          <div className="relative w-full min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
            <input
              type="search"
              placeholder="Search attendance, projects, expenses…"
              className="h-11 w-full min-w-0 rounded-full border border-[#d4deea] bg-white py-2 pl-9 pr-4 text-sm text-[#0f172a] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe] sm:h-10"
            />
          </div>
        ) : null}
      </div>
    </header>
  );
});
