"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { resolveNotificationHref } from "@/lib/notificationLinks";
import { playNotificationSound } from "@/lib/notifications/notificationSound";

type TaskNotif = {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
};

const SHOWN_KEY = "bb_task_notif_shown";

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

/** Popup when a new task is assigned to the signed-in user (bell updates via realtime too). */
export function TaskAssignmentPopup({ fallbackTaskHref = "/employee/my-tasks" }: { fallbackTaskHref?: string }) {
  const supabase = createClient();
  const [popup, setPopup] = useState<TaskNotif | null>(null);
  const userIdRef = useRef<string | null>(null);

  const showIfNew = useCallback((row: TaskNotif) => {
    const shown = loadShownIds();
    if (shown.has(row.id)) return;
    markShown(row.id);
    setPopup(row);
    playNotificationSound();
  }, []);

  const checkRecentUnread = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    userIdRef.current = uid;

    const { data, error } = await supabase
      .from("in_app_notifications")
      .select("id,title,body,link_path,read_at,created_at")
      .eq("user_id", uid)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) return;
    const taskRow = (data ?? []).find((n) => (n.title ?? "").toLowerCase().includes("new task assigned"));
    if (taskRow) {
      showIfNew({
        id: taskRow.id,
        title: taskRow.title,
        body: taskRow.body,
        link_path: taskRow.link_path,
      });
    }
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
        .channel(`task-assign-popup-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "in_app_notifications",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            const row = payload.new as {
              id?: string;
              title?: string;
              body?: string | null;
              link_path?: string | null;
            };
            if (!row.id) return;
            const title = (row.title ?? "").toLowerCase();
            if (!title.includes("new task assigned")) return;
            showIfNew({
              id: row.id,
              title: row.title ?? "New task",
              body: row.body ?? null,
              link_path: row.link_path ?? null,
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
    if (popup?.id) {
      await supabase.from("in_app_notifications").update({ read_at: new Date().toISOString() }).eq("id", popup.id);
    }
    setPopup(null);
  };

  if (!popup) return null;

  const href = resolveNotificationHref(popup.link_path, fallbackTaskHref);

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="alertdialog" aria-labelledby="task-popup-title">
      <div className="relative w-full max-w-sm rounded-2xl border border-[#d4deea] bg-white p-5 shadow-xl">
        <button
          type="button"
          onClick={() => void dismiss()}
          className="absolute right-3 top-3 rounded-full p-1 text-[#64748b] hover:bg-[#f1f5f9]"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
          <ClipboardList className="h-6 w-6" />
        </div>
        <p id="task-popup-title" className="mt-3 text-center text-lg font-semibold text-[#0f172a]">
          {popup.title}
        </p>
        {popup.body ? <p className="mt-1 text-center text-sm text-[#64748b]">{popup.body}</p> : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href={href}
            onClick={() => void dismiss()}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#2563eb] px-5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
          >
            View task
          </Link>
          <Button type="button" variant="outline" className="rounded-full border-[#d4deea]" onClick={() => void dismiss()}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
