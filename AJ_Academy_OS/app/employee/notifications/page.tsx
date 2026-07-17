"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveNotificationHref } from "@/lib/notificationLinks";
import { Button } from "@/components/ui/button";

type NotifRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

export default function EmployeeNotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    let q = supabase
      .from("in_app_notifications")
      .select("id,type,title,body,link_path,read_at,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (typeFilter) q = q.eq("type", typeFilter);
    const { data, error: loadError } = await q;
    if (loadError) {
      setError(loadError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as NotifRow[]);
    }
    setLoading(false);
  }, [supabase, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const types = useMemo(() => [...new Set(rows.map((r) => r.type))].sort(), [rows]);

  const markRead = async (id: string) => {
    await supabase.from("in_app_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    await load();
  };

  const markAll = async () => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    await supabase
      .from("in_app_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", uid)
      .is("read_at", null);
    await load();
  };

  return (
    <section className="space-y-4 rounded-[24px] border border-[#d4deea] bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Inbox</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#0f172a]">Notifications</h1>
          <p className="mt-1 text-sm text-[#64748b]">In-app history is the source of truth. Push is an extra delivery channel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-xl border border-[#dbe6f3] bg-white px-3 text-sm"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void markAll()}>
            Mark all read
          </Button>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-[#64748b]">Loading…</p>
      ) : !rows.length ? (
        <p className="rounded-xl border border-dashed border-[#e8edf5] px-4 py-10 text-center text-sm text-[#64748b]">
          No notifications yet.
        </p>
      ) : (
        <ul className="divide-y divide-[#e8edf5] rounded-[16px] border border-[#e8edf5]">
          {rows.map((n) => {
            const href = resolveNotificationHref(n.link_path, "/employee/my-tasks");
            return (
              <li key={n.id} className={["px-4 py-3", n.read_at ? "bg-white" : "bg-[#f8fbff]"].join(" ")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0f172a]">{n.title}</p>
                    {n.body ? <p className="mt-0.5 text-xs text-[#64748b]">{n.body}</p> : null}
                    <p className="mt-1 text-[11px] text-[#94a3b8]">
                      {n.type} · {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={href}
                      className="inline-flex h-8 items-center rounded-lg border border-[#dbe6f3] bg-white px-3 text-xs font-medium hover:bg-[#f8fbff]"
                      onClick={() => {
                        if (!n.read_at) void markRead(n.id);
                      }}
                    >
                      Open
                    </Link>
                    {!n.read_at ? (
                      <button type="button" className="text-xs text-[#64748b] hover:underline" onClick={() => void markRead(n.id)}>
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
