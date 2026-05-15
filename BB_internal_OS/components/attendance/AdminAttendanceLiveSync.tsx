"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDebouncedRouterRefresh } from "@/hooks/useDebouncedRouterRefresh";

const TABLES_BY_TAB: Record<string, string[]> = {
  overview: ["attendance_records"],
  logs: ["attendance_records"],
  permission: ["permission_requests"],
  summary: ["work_summaries"],
  monthly: ["attendance_records", "permission_requests", "work_summaries"],
};

/** Keeps admin attendance tabs in sync without hammering the server. */
export function AdminAttendanceLiveSync({ tab }: { tab: string }) {
  const scheduleRefresh = useDebouncedRouterRefresh(2500);

  useEffect(() => {
    const tables = TABLES_BY_TAB[tab] ?? TABLES_BY_TAB.overview;
    const supabase = createClient();
    let channel = supabase.channel(`admin-attendance-live-${tab}`);

    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tab, scheduleRefresh]);

  return null;
}
