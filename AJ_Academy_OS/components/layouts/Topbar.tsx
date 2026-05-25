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
  showSearchBar?: boolean;
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
    await fetch("/api/auth/clear-session", { method: "POST", credentials: "include" });
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-[#e8dcc8] bg-[#fffdf8]/95 px-3 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-[#fffdf8]/85 sm:px-4 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3">
        <div className="flex items-start gap-2 sm:gap-3">
          {mobileMenuTrigger ? <div className="shrink-0 pt-0.5 lg:hidden">{mobileMenuTrigger}</div> : null}

          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-semibold text-[#3d3428]">AJ Academy</p>
            <p className="truncate text-xs text-[#6b5d4d] sm:max-w-none">
              <span className="font-medium text-[#3d3428]">{fullName}</span>
              <span className="text-[#a68b2e]/60"> · </span>
              <span className="break-all sm:break-normal">{email}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <InAppNotificationsBell fallbackTaskHref={notificationFallbackHref} />
            <Button
              type="button"
              size="icon"
              className="touch-target hidden rounded-full sm:inline-flex"
              aria-label="Quick create"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Avatar className="h-9 w-9 shrink-0 border border-[#e8dcc8] bg-[#faf3e3] sm:h-10 sm:w-10">
              <AvatarFallback className="bg-[#faf3e3] text-xs font-semibold text-[#a68b2e] sm:text-sm">
                {fullName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Button
              type="button"
              variant="outline"
              onClick={handleLogout}
              className="touch-target hidden gap-2 rounded-full border-[#e8dcc8] bg-white px-3 text-[#3d3428] hover:bg-[#faf3e3] sm:inline-flex sm:px-4"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleLogout}
              className="touch-target rounded-full border-[#e8dcc8] bg-white text-[#a68b2e] sm:hidden"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showSearchBar ? (
          <div className="relative w-full min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b5d4d]" />
            <input
              type="search"
              placeholder="Search attendance, projects, expenses…"
              className="h-11 w-full min-w-0 rounded-full border border-[#e8dcc8] bg-white py-2 pl-9 pr-4 text-sm text-[#3d3428] outline-none transition focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/25 sm:h-10"
            />
          </div>
        ) : null}
      </div>
    </header>
  );
});
