"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Pin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDisplayDate } from "@/lib/datetime";
import { parseClientIds } from "@/lib/taskActivities";
import type { TaskAssignmentType, TaskRecord } from "@/types/task";

type EmployeeTaskPreviewProps = {
  tasksHref?: string;
  receiveOnly?: boolean;
};

type PinnedTask = TaskRecord & {
  pinned?: boolean;
  pin_section?: string | null;
  linked_summary?: string;
};

const SECTION_ORDER: { id: TaskAssignmentType | "all" | "other"; label: string; hrefSuffix: string }[] = [
  { id: "lead", label: "Student Lead", hrefSuffix: "?section=lead" },
  { id: "college", label: "College Visit", hrefSuffix: "?section=college" },
  { id: "project", label: "Project", hrefSuffix: "?section=project" },
  { id: "other", label: "Other", hrefSuffix: "" },
];

const TASK_PIN_SELECT =
  "id,title,description,assigned_to,priority,status,start_date,due_date,progress,project_id,assignment_type,client_ids,college_visit_ids,created_at,updated_at";

function sectionOf(task: PinnedTask): (typeof SECTION_ORDER)[number]["id"] {
  const fromPin = (task.pin_section || "").trim();
  if (fromPin === "lead" || fromPin === "college" || fromPin === "project") return fromPin;
  if (fromPin === "all") {
    const t = task.assignment_type;
    if (t === "lead" || t === "college" || t === "project") return t;
    return "other";
  }
  const t = task.assignment_type;
  if (t === "lead" || t === "college" || t === "project") return t;
  return "other";
}

function parseIdList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      return parseClientIds(JSON.parse(raw));
    } catch {
      return parseClientIds(raw);
    }
  }
  return parseClientIds(raw);
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
        .limit(24);
      const pinsFallback =
        pinsWithSection.error && /pin_section|column|schema cache/i.test(pinsWithSection.error.message)
          ? await supabase
              .from("employee_task_pins")
              .select("task_id,pinned_at")
              .eq("user_id", user.id)
              .order("pinned_at", { ascending: false })
              .limit(24)
          : null;
      if (pinsWithSection.error && !pinsFallback) {
        console.warn("employee_task_pins load:", pinsWithSection.error.message);
      }
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
        const pinnedQuery = await supabase
          .from("tasks")
          .select(TASK_PIN_SELECT)
          .in("id", pinnedIds)
          .returns<TaskRecord[]>();
        let pinnedRows = pinnedQuery.data;
        if (pinnedQuery.error) {
          console.warn("pinned tasks load:", pinnedQuery.error.message);
          // Fallback without optional assignment columns if schema is older
          const fallback = await supabase
            .from("tasks")
            .select(
              "id,title,description,assigned_to,priority,status,start_date,due_date,progress,project_id,assignment_type,client_ids,created_at,updated_at",
            )
            .in("id", pinnedIds)
            .returns<TaskRecord[]>();
          pinnedRows = fallback.data;
          if (fallback.error) console.warn("pinned tasks fallback:", fallback.error.message);
        }
        const byId = Object.fromEntries((pinnedRows ?? []).map((t) => [t.id, t]));
        for (const id of pinnedIds) {
          if (byId[id]) {
            pinnedTasks.push({ ...byId[id], pinned: true, pin_section: pinSectionById[id] });
          }
        }
      }

      const { data, error } = await supabase
        .from("tasks")
        .select(TASK_PIN_SELECT)
        .eq("assigned_to", user.id)
        .order("updated_at", { ascending: false })
        .limit(6)
        .returns<TaskRecord[]>();

      const recent = error ? [] : (data ?? []).filter((t) => !pinnedIds.includes(t.id));
      const mergedBase: PinnedTask[] = [
        ...pinnedTasks,
        ...recent.map((t) => ({ ...t, pinned: false, pin_section: t.assignment_type ?? null })),
      ].slice(0, 16);

      // Hydrate linked labels for section tables
      const clientIds = [...new Set(mergedBase.flatMap((t) => parseIdList(t.client_ids)))];
      const collegeIds = [...new Set(mergedBase.flatMap((t) => parseIdList(t.college_visit_ids)))];
      const projectIds = [...new Set(mergedBase.map((t) => t.project_id).filter(Boolean) as string[])];

      const clientLabel: Record<string, string> = {};
      const collegeLabel: Record<string, string> = {};
      const projectLabel: Record<string, string> = {};

      if (clientIds.length) {
        const { data: clients } = await supabase.from("clients").select("id,lead_name,name").in("id", clientIds);
        for (const c of clients ?? []) {
          const row = c as { id: string; lead_name?: string | null; name?: string | null };
          clientLabel[row.id] = row.lead_name?.trim() || row.name?.trim() || row.id.slice(0, 8);
        }
      }
      if (collegeIds.length) {
        const { data: colleges } = await supabase
          .from("college_visits")
          .select("id,college_name,location")
          .in("id", collegeIds);
        for (const c of colleges ?? []) {
          const row = c as { id: string; college_name?: string | null; location?: string | null };
          collegeLabel[row.id] =
            [row.college_name, row.location].filter(Boolean).join(" · ") || row.id.slice(0, 8);
        }
      }
      if (projectIds.length) {
        const { data: projects } = await supabase
          .from("projects")
          .select("id,project_name,project_code")
          .in("id", projectIds);
        for (const p of projects ?? []) {
          const row = p as { id: string; project_name?: string | null; project_code?: string | null };
          projectLabel[row.id] =
            [row.project_code, row.project_name].filter(Boolean).join(" · ") || row.id.slice(0, 8);
        }
      }

      const withSummaries = mergedBase.map((t) => {
        const section = sectionOf(t);
        let linked_summary = "-";
        if (section === "lead") {
          const ids = parseIdList(t.client_ids);
          linked_summary = ids.length
            ? ids.map((id) => clientLabel[id] || id.slice(0, 8)).join(", ")
            : "-";
        } else if (section === "college") {
          const ids = parseIdList(t.college_visit_ids);
          linked_summary = ids.length
            ? ids.map((id) => collegeLabel[id] || id.slice(0, 8)).join(", ")
            : "-";
        } else if (section === "project") {
          linked_summary = t.project_id ? projectLabel[t.project_id] || t.project_id.slice(0, 8) : "-";
        }
        return { ...t, linked_summary };
      });

      setRows(withSummaries);
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

  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
  const td = "px-3 py-2 text-sm text-[#334155]";

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
          <div className="rounded-xl border border-[#e8edf5] p-4 text-sm text-[#64748b]">Loading tasks...</div>
        ) : rows.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-[#e8edf5] p-4 text-sm text-[#64748b]">
            <ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-[#94a3b8]" />
            <div>
              <p className="font-medium text-[#334155]">No tasks yet</p>
              <p className="mt-1">
                {receiveOnly
                  ? "When someone assigns you work, it will show here and on My Tasks."
                  : "Open My Tasks -> pick a subsection -> multi-select rows -> Pin selected to dashboard."}
              </p>
            </div>
          </div>
        ) : (
          <>
            {grouped.buckets.map((bucket) => {
              const linkedCol =
                bucket.id === "lead" ? "Student Lead(s)" : bucket.id === "college" ? "College(s)" : bucket.id === "project" ? "Project" : "Linked";
              return (
                <div key={bucket.id} className="overflow-hidden rounded-xl border border-[#e8edf5]">
                  <div className="flex items-center justify-between gap-2 border-b border-[#e8edf5] bg-[#f8fbff] px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Pin className="h-3.5 w-3.5 text-[#c9a227]" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{bucket.label}</p>
                      <span className="text-[11px] text-[#94a3b8]">({bucket.items.length})</span>
                    </div>
                    <Link
                      href={`${tasksHref}${bucket.hrefSuffix}`}
                      className="text-xs font-semibold text-[#2563eb] hover:underline"
                    >
                      Open subsection
                    </Link>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-[#fafcff]">
                        <tr>
                          <th className={th}>Task</th>
                          <th className={th}>{linkedCol}</th>
                          <th className={th}>Status</th>
                          <th className={th}>Priority</th>
                          <th className={th}>Progress</th>
                          <th className={th}>Due</th>
                          <th className={th}> </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8edf5]">
                        {bucket.items.map((task) => (
                          <tr key={task.id} className="hover:bg-[#fafcff]">
                            <td className={`${td} max-w-[14rem] truncate font-medium text-[#0f172a]`} title={task.title}>
                              {task.title}
                            </td>
                            <td className={`${td} max-w-[16rem] truncate`} title={task.linked_summary || ""}>
                              {task.linked_summary || "-"}
                            </td>
                            <td className={td}>{task.status}</td>
                            <td className={td}>{task.priority}</td>
                            <td className={td}>{task.progress}%</td>
                            <td className={td}>{task.due_date ? formatDisplayDate(task.due_date) : "-"}</td>
                            <td className={td}>
                              <Link
                                href={`${tasksHref}${bucket.hrefSuffix}`}
                                className="text-xs font-semibold text-[#2563eb] hover:underline"
                              >
                                Open
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {grouped.recentOnly.length ? (
              <div className="overflow-hidden rounded-xl border border-[#e8edf5]">
                <div className="border-b border-[#e8edf5] bg-[#f8fbff] px-4 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Recent (not pinned)</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-[#fafcff]">
                      <tr>
                        <th className={th}>Task</th>
                        <th className={th}>Type</th>
                        <th className={th}>Linked</th>
                        <th className={th}>Status</th>
                        <th className={th}>Priority</th>
                        <th className={th}>Due</th>
                        <th className={th}> </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8edf5]">
                      {grouped.recentOnly.map((task) => (
                        <tr key={task.id} className="hover:bg-[#fafcff]">
                          <td className={`${td} max-w-[14rem] truncate font-medium`}>{task.title}</td>
                          <td className={td}>
                            {task.assignment_type === "lead"
                              ? "Student Lead"
                              : task.assignment_type === "college"
                                ? "College Visit"
                                : task.assignment_type === "project"
                                  ? "Project"
                                  : "-"}
                          </td>
                          <td className={`${td} max-w-[14rem] truncate`}>{task.linked_summary || "-"}</td>
                          <td className={td}>{task.status}</td>
                          <td className={td}>{task.priority}</td>
                          <td className={td}>{task.due_date ? formatDisplayDate(task.due_date) : "-"}</td>
                          <td className={td}>
                            <Link href={tasksHref} className="text-xs font-semibold text-[#2563eb] hover:underline">
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
