"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDisplayDate } from "@/lib/datetime";
import type { TaskAssignmentType, TaskRecord } from "@/types/task";

type EmployeeTaskPreviewProps = {
  tasksHref?: string;
  receiveOnly?: boolean;
};

type PinnedTask = TaskRecord & { pinned?: boolean; pin_section?: string | null };

const SECTION_ORDER: { id: TaskAssignmentType | "all" | "other"; label: string }[] = [
  { id: "lead", label: "Student Lead" },
  { id: "college", label: "College Visit" },
  { id: "project", label: "Project" },
  { id: "other", label: "Other" },
];

function sectionOf(task: PinnedTask): (typeof SECTION_ORDER)[number]["id"] {
  const fromPin = (task.pin_section || "").trim();
  if (fromPin === "lead" || fromPin === "college" || fromPin === "project") return fromPin;
  const t = task.assignment_type;
  if (t === "lead" || t === "college" || t === "project") return t;
  return "other";
}

export function EmployeeTaskPreview({ tasksHref = "/employee/my-tasks", receiveOnly = false }: EmployeeTaskPreviewProps) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<PinnedTask[]>([]);
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

      const pinMeta: { task_id: string; pin_section: string | null }[] = [];
      const pinsWithSection = await supabase
        .from("employee_task_pins")
        .select("task_id,pinned_at,pin_section")
        .eq("user_id", user.id)
        .order("pinned_at", { ascending: false })
        .limit(12);
      const pinsFallback =
        pinsWithSection.error && /pin_section|column|schema cache/i.test(pinsWithSection.error.message)
          ? await supabase
              .from("employee_task_pins")
              .select("task_id,pinned_at")
              .eq("user_id", user.id)
              .order("pinned_at", { ascending: false })
              .limit(12)
          : null;
      const pinRows = pinsFallback?.data ?? pinsWithSection.data ?? [];
      for (const p of pinRows) {
        if (p.task_id) {
          pinMeta.push({
            task_id: p.task_id as string,
            pin_section: "pin_section" in p ? ((p as { pin_section?: string | null }).pin_section ?? null) : null,
          });
        }
      }

      const pinnedIds = pinMeta.map((p) => p.task_id);
      const pinSectionById = Object.fromEntries(pinMeta.map((p) => [p.task_id, p.pin_section]));

      const pinnedTasks: PinnedTask[] = [];
      if (pinnedIds.length) {
        const { data: pinnedRows } = await supabase
          .from("tasks")
          .select("id,title,description,assigned_to,priority,status,start_date,due_date,progress,project_id,assignment_type,created_at,updated_at")
          .in("id", pinnedIds)
          .returns<TaskRecord[]>();
        const byId = Object.fromEntries((pinnedRows ?? []).map((t) => [t.id, t]));
        for (const id of pinnedIds) {
          if (byId[id]) {
            pinnedTasks.push({ ...byId[id], pinned: true, pin_section: pinSectionById[id] });
          }
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
        setRows(pinnedTasks);
        return;
      }

      const recent = (data ?? []).filter((t) => !pinnedIds.includes(t.id));
      const merged = [
        ...pinnedTasks,
        ...recent.map((t) => ({ ...t, pinned: false, pin_section: t.assignment_type ?? null })),
      ].slice(0, 10);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_task_pins" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load, supabase]);

  const grouped = useMemo(() => {
    const pinnedOnly = rows.filter((r) => r.pinned);
    const recentOnly = rows.filter((r) => !r.pinned);
    const buckets = SECTION_ORDER.map((s) => ({
      ...s,
      items: pinnedOnly.filter((t) => sectionOf(t) === s.id),
    })).filter((b) => b.items.length > 0);
    return { buckets, recentOnly };
  }, [rows]);

  return (
    <section className="scroll-mt-24 rounded-[22px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]" id="my-tasks-preview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">My tasks</p>
          <h3 className="mt-1 text-lg font-semibold text-[#0f172a]">Dashboard pins & recent work</h3>
          <p className="mt-1 text-sm text-[#64748b]">
            {receiveOnly
              ? "Tasks assigned to you by admins, mentors, or freelancers."
              : "Pins from My Tasks subsections (Student Lead / College Visit / Project), plus recent work."}
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

      <div className="mt-4 space-y-4">
        {loading ? (
          <div className="rounded-xl border border-[#e8edf5] p-4 text-sm text-[#64748b]">Loading tasks…</div>
        ) : rows.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-[#e8edf5] p-4 text-sm text-[#64748b]">
            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[#94a3b8]" />
            <div>
              <p className="font-medium text-[#334155]">No tasks yet</p>
              <p className="mt-1">
                {receiveOnly
                  ? "When someone assigns you work, it will show here and on My Tasks."
                  : "Open My Tasks → pick a subsection → Add to my dashboard → multi-select → Pin selected."}
              </p>
            </div>
          </div>
        ) : (
          <>
            {grouped.buckets.map((bucket) => (
              <div key={bucket.id} className="overflow-hidden rounded-xl border border-[#e8edf5]">
                <div className="flex items-center gap-2 border-b border-[#e8edf5] bg-[#f8fbff] px-4 py-2">
                  <Pin className="h-3.5 w-3.5 text-[#c9a227]" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{bucket.label}</p>
                </div>
                <div className="divide-y divide-[#e8edf5]">
                  {bucket.items.map((task) => (
                    <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[#0f172a]">{task.title}</p>
                        <p className="mt-0.5 text-xs text-[#64748b]">
                          {task.status} · {task.priority}
                          {task.due_date ? ` · due ${formatDisplayDate(task.due_date)}` : ""}
                        </p>
                      </div>
                      <Link href={tasksHref} className="text-xs font-semibold text-[#2563eb] hover:underline">
                        Open
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {grouped.recentOnly.length ? (
              <div className="overflow-hidden rounded-xl border border-[#e8edf5]">
                <div className="border-b border-[#e8edf5] bg-[#f8fbff] px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Recent (not pinned)</p>
                </div>
                <div className="divide-y divide-[#e8edf5]">
                  {grouped.recentOnly.map((task) => (
                    <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-[#0f172a]">{task.title}</p>
                        <p className="mt-0.5 text-xs text-[#64748b]">
                          {task.status} · {task.priority}
                          {task.due_date ? ` · due ${formatDisplayDate(task.due_date)}` : ""}
                        </p>
                      </div>
                      <Link href={tasksHref} className="text-xs font-semibold text-[#2563eb] hover:underline">
                        Open
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
