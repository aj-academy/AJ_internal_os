"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
};

const SHOWN_KEY = "aj_counselling_notif_shown";

function loadShownIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function markShown(id: string) {
  const set = loadShownIds();
  set.add(id);
  sessionStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(set).slice(-50)));
}

export function CounsellingSchedulePopup() {
  const supabase = createClient();
  const [popup, setPopup] = useState<NotifRow | null>(null);
  const userIdRef = useRef<string | null>(null);

  const showIfNew = useCallback((row: NotifRow) => {
    const shown = loadShownIds();
    if (shown.has(row.id)) return;
    markShown(row.id);
    setPopup(row);
  }, []);

  const checkRecentUnread = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    userIdRef.current = uid;

    const { data, error } = await supabase
      .from("in_app_notifications")
      .select("id,title,body,link_path,read_at,created_at,type")
      .eq("user_id", uid)
      .eq("type", "counselling_scheduled")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return;
    const row = (data ?? [])[0];
    if (!row?.id) return;
    showIfNew({
      id: row.id,
      title: row.title ?? "Counselling scheduled",
      body: row.body ?? null,
      link_path: row.link_path ?? "/student/dashboard",
    });
  }, [showIfNew, supabase]);

  useEffect(() => {
    void checkRecentUnread();
  }, [checkRecentUnread]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      userIdRef.current = uid;
      channel = supabase
        .channel(`counselling-popup-${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "in_app_notifications", filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as { id?: string; title?: string; body?: string | null; link_path?: string | null; type?: string | null };
            if (!row.id || row.type !== "counselling_scheduled") return;
            showIfNew({
              id: row.id,
              title: row.title ?? "Counselling scheduled",
              body: row.body ?? null,
              link_path: row.link_path ?? "/student/dashboard",
            });
          },
        )
        .subscribe();
    };

    void setup();
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [showIfNew, supabase]);

  const dismiss = async () => {
    if (popup?.id) await supabase.from("in_app_notifications").update({ read_at: new Date().toISOString() }).eq("id", popup.id);
    setPopup(null);
  };

  if (!popup) return null;
  const href = (popup.link_path || "/student/dashboard").trim() || "/student/dashboard";

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="alertdialog" aria-labelledby="counselling-popup-title">
      <div className="relative w-full max-w-sm rounded-2xl border border-[#e8dcc8] bg-white p-5 shadow-xl">
        <button type="button" onClick={() => void dismiss()} className="absolute right-3 top-3 rounded-full p-1 text-[#64748b] hover:bg-[#f1f5f9]" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#faf3e3] text-[#c9a227]">
          <CalendarClock className="h-6 w-6" />
        </div>
        <p id="counselling-popup-title" className="mt-3 text-center text-lg font-semibold text-[#0f172a]">{popup.title}</p>
        {popup.body ? <p className="mt-2 text-center text-sm text-[#64748b]">{popup.body}</p> : null}
        <div className="mt-4 flex justify-center gap-2">
          <Link href={href} className="rounded-full bg-[#c9a227] px-4 py-2 text-sm font-medium text-white hover:bg-[#b8921f]" onClick={() => void dismiss()}>
            Open dashboard
          </Link>
          <button type="button" className="rounded-full border border-[#dbe6f3] px-4 py-2 text-sm text-[#334155]" onClick={() => void dismiss()}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
