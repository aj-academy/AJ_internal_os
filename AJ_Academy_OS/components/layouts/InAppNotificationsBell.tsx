"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { playNotificationSound } from "@/lib/notifications/notificationSound";
import { Button } from "@/components/ui/button";
import { resolveNotificationHref } from "@/lib/notificationLinks";

type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

function actionLabel(type: string, linkPath: string | null) {
  const t = type.toLowerCase();
  const path = (linkPath ?? "").toLowerCase();
  if (t.includes("counselling")) return "View session";
  if (t.includes("task")) return "View task";
  if (path.includes("leave")) return "View leave";
  if (path.includes("reimburse")) return "View reimbursement";
  if (path.includes("attendance")) return "View attendance";
  return "Open";
}

export function InAppNotificationsBell({ fallbackTaskHref }: { fallbackTaskHref: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const initialLoadDone = useRef(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    setUserId(uid);
    if (!uid) return;
    const { data, error } = await supabase
      .from("in_app_notifications")
      .select("id,type,title,body,link_path,read_at,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      const m = error.message?.toLowerCase() ?? "";
      if (!m.includes("in_app_notifications") && !m.includes("schema cache") && !m.includes("does not exist")) {
        console.warn("in_app_notifications:", error.message);
      }
      setRows([]);
      return;
    }
    setRows((data ?? []) as NotifRow[]);
  }, [supabase]);

  useEffect(() => {
    void load().then(() => {
      initialLoadDone.current = true;
    });
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("in-app-notifs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "in_app_notifications", filter: `user_id=eq.${userId}` },
        () => {
          if (initialLoadDone.current) playNotificationSound();
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load, supabase, userId]);

  const unread = useMemo(() => rows.filter((r) => !r.read_at).length, [rows]);

  const markRead = async (id: string) => {
    await supabase.from("in_app_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    await load();
  };

  const clearAll = async () => {
    if (!userId || unread === 0) return;
    const now = new Date().toISOString();
    await supabase.from("in_app_notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null);
    await load();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={popRef}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="touch-target relative rounded-full border-[#e8dcc8] bg-white text-[#3d3428]"
        onClick={() => {
          setOpen((o) => !o);
          void load();
        }}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div className="absolute left-1/2 z-50 mt-2 w-[min(100vw-2rem,400px)] -translate-x-1/2 rounded-xl border border-[#dbe6f3] bg-white py-2 shadow-lg sm:left-auto sm:right-0 sm:translate-x-0">
          <div className="flex items-center justify-between border-b border-[#eef2ff] px-3 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
              Notifications{unread > 0 ? ` (${unread} new)` : ""}
            </p>
            {unread > 0 ? (
              <button type="button" className="text-xs font-medium text-[#2563eb] hover:underline" onClick={() => void clearAll()}>
                Clear all
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(70vh,420px)] overflow-y-auto">
            {!rows.length ? (
              <p className="px-3 py-6 text-center text-sm text-[#64748b]">No notifications yet.</p>
            ) : (
              rows.map((n) => {
                const href = resolveNotificationHref(n.link_path, fallbackTaskHref);
                const label = actionLabel(n.type, href);
                return (
                  <div
                    key={n.id}
                    className={[
                      "border-b border-[#f1f5f9] px-3 py-3 last:border-0",
                      n.read_at ? "opacity-70" : "bg-[#f8fbff]",
                    ].join(" ")}
                  >
                    <p className="text-sm font-semibold text-[#0f172a]">{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-xs text-[#64748b]">{n.body}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={href}
                        className="inline-flex h-8 items-center rounded-lg border border-[#dbe6f3] bg-white px-3 text-xs font-medium text-[#334155] hover:bg-[#f8fbff]"
                        onClick={() => {
                          if (!n.read_at) void markRead(n.id);
                          setOpen(false);
                        }}
                      >
                        {label}
                      </Link>
                      {!n.read_at ? (
                        <button
                          type="button"
                          className="text-xs text-[#64748b] hover:text-[#0f172a] hover:underline"
                          onClick={() => void markRead(n.id)}
                        >
                          Dismiss
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
