"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Menu, Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

import { InAppNotificationsBell } from "@/components/layouts/InAppNotificationsBell";

interface TopbarProps {
  fullName: string;
  email: string;
  notificationFallbackHref: string;
}

export const Topbar = memo(function Topbar({ fullName, email, notificationFallbackHref }: TopbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <header className="sticky top-0 z-20 bg-[#eaf1f8] px-4 py-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1f2937]">BB Internal OS</p>
          <p className="truncate text-xs text-[#64748b]">
            {fullName} - {email}
          </p>
        </div>

        <div className="relative w-full max-w-xl min-w-[230px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
          <input
            type="search"
            placeholder="Try searching attendance, projects, expenses"
            className="h-10 w-full rounded-full border border-[#d4deea] bg-white pl-9 pr-4 text-sm text-[#0f172a] outline-none transition focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full border-[#d4deea] bg-white text-[#1e3a8a]"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <InAppNotificationsBell fallbackTaskHref={notificationFallbackHref} />
          <Button
            size="icon"
            className="rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Avatar className="h-10 w-10 border border-[#d4deea] bg-white">
            <AvatarFallback className="bg-[#e0eaff] text-[#1d4ed8]">
              {fullName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="gap-2 rounded-full border-[#d4deea] bg-white px-4 text-[#1f2937] hover:bg-[#eef4ff]"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
});
