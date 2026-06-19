"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { TaskRecord } from "@/types/task";

export function EmployeeTaskPreview() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setRows([]);
        return;
      }
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,description,assigned_to,priority,status,start_date,due_date,progress,project_id,created_at,updated_at")
        .eq("assigned_to", user.id)
        .order("updated_at", { ascending: false })
        .limit(6)
        .returns<TaskRecord[]>();
      if (error) {
        setRows([]);
        return;
      }
      setRows(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("employee-dashboard-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load, supabase]);

  return (
    <section className="scroll-mt-24 rounded-[22px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]" id="my-tasks-preview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">My tasks</p>
          <h3 className="mt-1 text-lg font-semibold text-[#0f172a]">Recent work</h3>
          <p className="mt-1 text-sm text-[#64748b]">Same list as My Tasks — includes anything admins assign to your account.</p>
        </div>
        <Link
          href="/employee/my-tasks"
          className="inline-flex h-9 items-center gap-1 rounded-full bg-[#2563eb] px-4 text-sm font-medium text-white hover:bg-[#1d4ed8]"
        >
          Open My Tasks
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-4 divide-y divide-[#e8edf5] rounded-xl border border-[#e8edf5]">
        {loading ? (
          <p className="p-4 text-sm text-[#64748b]">Loading tasks…</p>
        ) : rows.length === 0 ? (
          <div className="flex items-start gap-3 p-4 text-sm text-[#64748b]">
            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[#94a3b8]" />
            <div>
              <p className="font-medium text-[#334155]">No tasks yet</p>
              <p className="mt-1">When an admin assigns you work, it will show here and on My Tasks. You can also add your own tasks from My Tasks.</p>
            </div>
          </div>
        ) : (
          rows.map((task) => (
            <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[#0f172a]">{task.title}</p>
                <p className="text-xs text-[#64748b]">
                  {task.status} · {task.priority}
                  {task.due_date ? ` · Due ${task.due_date}` : ""}
                </p>
              </div>
              <span className="rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-xs font-medium text-[#1d4ed8]">{task.progress}%</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
