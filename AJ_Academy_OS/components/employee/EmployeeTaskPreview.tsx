"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { TaskRecord } from "@/types/task";

type EmployeeTaskPreviewProps = {
  tasksHref?: string;
  receiveOnly?: boolean;
};

export function EmployeeTaskPreview({ tasksHref = "/employee/my-tasks", receiveOnly = false }: EmployeeTaskPreviewProps) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<(TaskRecord & { pinned?: boolean })[]>([]);
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

      const pinnedIds: string[] = [];
      const { data: pins } = await supabase
        .from("employee_task_pins")
        .select("task_id,pinned_at")
        .eq("user_id", user.id)
        .order("pinned_at", { ascending: false })
        .limit(6);
      for (const p of pins ?? []) {
        if (p.task_id) pinnedIds.push(p.task_id as string);
      }

      const pinnedTasks: TaskRecord[] = [];
      if (pinnedIds.length) {
        const { data: pinnedRows } = await supabase
          .from("tasks")
          .select("id,title,description,assigned_to,priority,status,start_date,due_date,progress,project_id,assignment_type,created_at,updated_at")
          .in("id", pinnedIds)
          .returns<TaskRecord[]>();
        const byId = Object.fromEntries((pinnedRows ?? []).map((t) => [t.id, t]));
        for (const id of pinnedIds) {
          if (byId[id]) pinnedTasks.push(byId[id]);
        }
      }

      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,description,assigned_to,priority,status,start_date,due_date,progress,project_id,assignment_type,created_at,updated_at")
        .eq("assigned_to", user.id)
        .order("updated_at", { ascending: false })
        .limit(6)
        .returns<TaskRecord[]>();
      if (error) {
        setRows(pinnedTasks.map((t) => ({ ...t, pinned: true })));
        return;
      }

      const recent = (data ?? []).filter((t) => !pinnedIds.includes(t.id));
      const merged = [
        ...pinnedTasks.map((t) => ({ ...t, pinned: true })),
        ...recent.map((t) => ({ ...t, pinned: false })),
      ].slice(0, 6);
      setRows(merged);
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
          <p className="mt-1 text-sm text-[#64748b]">
            {receiveOnly
              ? "Tasks assigned to you by admins, mentors, or freelancers."
              : "Pinned handover tasks plus recent work from My Tasks."}
          </p>
        </div>
        <Link
          href={tasksHref}
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
              <p className="mt-1">
                {receiveOnly
                  ? "When someone assigns you work, it will show here and on My Tasks."
                  : "When an admin assigns you work, it will show here. Use View / Activity → Add to my dashboard to pin handover follow-ups."}
              </p>
            </div>
          </div>
        ) : (
          rows.map((task) => (
            <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-medium text-[#0f172a]">
                  {task.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-[#c9a227]" aria-label="Pinned" /> : null}
                  {task.title}
                </p>
                <p className="mt-0.5 text-xs text-[#64748b]">
                  {task.status} · {task.priority}
                  {task.due_date ? ` · due ${task.due_date}` : ""}
                </p>
              </div>
              <Link href={tasksHref} className="text-xs font-semibold text-[#2563eb] hover:underline">
                Open
              </Link>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
