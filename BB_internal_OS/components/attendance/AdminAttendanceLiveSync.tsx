"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Keeps admin attendance tabs in sync without a manual refresh toggle. */
export function AdminAttendanceLiveSync() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-attendance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, () => {
        router.refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "permission_requests" }, () => {
        router.refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "work_summaries" }, () => {
        router.refresh();
      })
      .subscribe();

    const interval = window.setInterval(() => {
      router.refresh();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
