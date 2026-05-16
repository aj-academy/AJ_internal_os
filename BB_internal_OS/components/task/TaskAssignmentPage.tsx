"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { CollapsibleFilterPanel, FilterField } from "@/components/ui/CollapsibleFilterPanel";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/client-lead/LeadSummaryCard";
import { TaskForm, type TaskFormValue } from "@/components/task/TaskForm";
import { TaskTable } from "@/components/task/TaskTable";
import { TaskCompleteDialog } from "@/components/task/TaskCompleteDialog";
import { assignerDisplayFromProfile } from "@/lib/profileDisplayName";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

type AppRole = "admin" | "employee" | "manager";

interface TaskAssignmentPageProps {
  role: AppRole;
}

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string | null;
  department?: string | null;
  role?: string | null;
}

const initialForm: TaskFormValue = {
  title: "",
  description: "",
  assigned_to: "",
  project_id: "",
  priority: "Medium",
  status: "Pending",
  start_date: "",
  due_date: "",
  progress: 0,
};

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function isMissingTasksTableMessage(message: string) {
  const m = message.toLowerCase();
  return (
    (m.includes("could not find the table") && m.includes("tasks")) ||
    (m.includes("relation") && m.includes("tasks") && m.includes("does not exist")) ||
    (m.includes("schema cache") && m.includes("tasks")) ||
    (m.includes("pgrst205") && m.includes("tasks")) ||
    (m.includes("column") && m.includes("tasks") && (m.includes("assigned_by") || m.includes("completion_summary")))
  );
}

function toReadableTaskError(input: unknown) {
  const raw = input instanceof Error ? input.message : "Unexpected error.";
  if (isMissingTasksTableMessage(raw)) {
    return "DATABASE_SETUP: The `public.tasks` table is not in this Supabase project yet. In Supabase SQL Editor, run `BB_internal_SB/task_schema.sql` (see DATABASE_SETUP_ORDER.txt), then refresh this page.";
  }
  if (
    raw.toLowerCase().includes("get_team_assignees") ||
    raw.toLowerCase().includes("get_task_assignees") ||
    raw.toLowerCase().includes("tasks_employee_may_assign_to")
  ) {
    return "DATABASE_SETUP: Re-run `BB_internal_SB/task_schema.sql` in Supabase so assignee RPCs (`get_team_assignees`, `get_task_assignees`) and task rules exist, then refresh.";
  }
  return raw;
}

export function TaskAssignmentPage({ role }: TaskAssignmentPageProps) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isEmployee = role === "employee";
  const seesAllTasks = isAdmin || isManager;
  const canManageTasks = isAdmin || isManager;
  const [currentUserId, setCurrentUserId] = useState("");
  const [employees, setEmployees] = useState<ProfileOption[]>([]);
  const [rows, setRows] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tasksTableMissing, setTasksTableMissing] = useState(false);
  const [summary, setSummary] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormValue>(initialForm);
  const [viewTask, setViewTask] = useState<TaskRecord | null>(null);
  const [completeTask, setCompleteTask] = useState<TaskRecord | null>(null);
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [projectOptions, setProjectOptions] = useState<{ id: string; label: string }[]>([]);

  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dueDateFilter, setDueDateFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [applied, setApplied] = useState({
    status: "",
    priority: "",
    assigned: "",
    dueDate: "",
    search: "",
  });

  const progressDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /** Assignee id when the edit panel was opened; used to detect reassignment for email. */
  const assigneeBeforeEditRef = useRef<string | null>(null);

  const loadProjectsForForm = useCallback(async () => {
    const { data, error: projErr } = await supabase
      .from("projects")
      .select("id,project_name,project_code")
      .order("project_name", { ascending: true })
      .limit(400);
    if (projErr) {
      setProjectOptions([]);
      return;
    }
    setProjectOptions(
      (data ?? []).map((row: { id: string; project_name: string | null; project_code: string | null }) => ({
        id: row.id,
        label: [row.project_code, row.project_name].filter(Boolean).join(" · ") || row.id.slice(0, 8),
      })),
    );
  }, [supabase]);

  const loadAssignees = useCallback(async () => {
    if (isEmployee) {
      const { data, error: rpcError } = await supabase.rpc("get_team_assignees");
      if (rpcError) throw new Error(rpcError.message);
      const rows = (data ?? []) as { id: string; full_name: string | null; email: string | null; department?: string | null }[];
      setEmployees(rows.map((r) => ({ id: r.id, full_name: r.full_name, email: r.email, department: r.department ?? null })));
      return;
    }
    const { data: rpcRows, error: rpcError } = await supabase.rpc("get_task_assignees");
    if (!rpcError && Array.isArray(rpcRows)) {
      const rows = rpcRows as { id: string; full_name: string | null; email: string | null; department: string | null; role: string | null }[];
      setEmployees(rows.map((r) => ({ id: r.id, full_name: r.full_name, email: r.email, department: r.department, role: r.role })));
      return;
    }
    const { data, error: profilesError } = await supabase
      .from("profiles")
      .select("id,full_name,email,department,role")
      .in("role", ["employee", "manager", "admin", "super_admin"])
      .or("status.is.null,status.eq.active")
      .order("full_name", { ascending: true })
      .returns<ProfileOption[]>();
    if (profilesError) throw new Error(profilesError.message);
    setEmployees(data ?? []);
  }, [isEmployee, supabase]);

  const loadSummary = useCallback(
    async (userId: string) => {
      let totalQuery = supabase.from("tasks").select("id", { count: "exact", head: true });
      let pendingQuery = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "Pending");
      let inProgressQuery = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "In Progress");
      let completedQuery = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "Completed");

      if (!seesAllTasks) {
        totalQuery = totalQuery.eq("assigned_to", userId);
        pendingQuery = pendingQuery.eq("assigned_to", userId);
        inProgressQuery = inProgressQuery.eq("assigned_to", userId);
        completedQuery = completedQuery.eq("assigned_to", userId);
      }

      const [totalRes, pendingRes, inProgressRes, completedRes] = await Promise.all([
        totalQuery,
        pendingQuery,
        inProgressQuery,
        completedQuery,
      ]);

      const summaryError = totalRes.error ?? pendingRes.error ?? inProgressRes.error ?? completedRes.error;
      if (summaryError) {
        if (isMissingTasksTableMessage(summaryError.message)) {
          setTasksTableMissing(true);
          setSummary({ total: 0, pending: 0, inProgress: 0, completed: 0 });
          return;
        }
        throw new Error(summaryError.message);
      }

      setTasksTableMissing(false);
      setSummary({
        total: totalRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        inProgress: inProgressRes.count ?? 0,
        completed: completedRes.count ?? 0,
      });
    },
    [seesAllTasks, supabase],
  );

  const loadTasks = useCallback(
    async (userId: string) => {
      let query = supabase
        .from("tasks")
        .select(
          "id,title,description,assigned_to,assigned_by,completion_summary,priority,status,start_date,due_date,progress,project_id,created_at,updated_at",
        );

      if (!seesAllTasks) query = query.eq("assigned_to", userId);
      if (applied.status) query = query.eq("status", applied.status);
      if (applied.priority) query = query.eq("priority", applied.priority);
      if (applied.assigned) query = query.eq("assigned_to", applied.assigned);
      if (applied.dueDate) query = query.eq("due_date", applied.dueDate);
      if (applied.search) query = query.ilike("title", `%${applied.search}%`);

      query = query.order("due_date", { ascending: true, nullsFirst: false });

      const { data, error: taskError } = await query;
      if (taskError) {
        if (isMissingTasksTableMessage(taskError.message)) {
          setTasksTableMissing(true);
          setRows([]);
          return;
        }
        throw new Error(taskError.message);
      }
      setTasksTableMissing(false);

      type Raw = {
        id: string;
        title: string;
        description: string | null;
        assigned_to: string;
        assigned_by?: string | null;
        completion_summary?: string | null;
        priority: TaskPriority;
        status: TaskStatus;
        start_date: string | null;
        due_date: string | null;
        progress: number;
        project_id?: string | null;
        created_at: string;
        updated_at: string;
      };

      const rawRows = (data ?? []) as Raw[];
      const assignerIds = Array.from(
        new Set(rawRows.map((r) => r.assigned_by).filter((id): id is string => Boolean(id))),
      );
      let assignerMap: Record<string, { full_name: string | null; email: string | null; role: string | null }> = {};
      if (assignerIds.length) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id,full_name,email,role")
          .in("id", assignerIds);
        if (!profErr && profs) {
          assignerMap = Object.fromEntries(profs.map((p) => [p.id, p]));
        }
      }

      const mapped: TaskRecord[] = rawRows.map((row) => ({
        ...row,
        assigner_display_name: row.assigned_by
          ? assignerDisplayFromProfile(assignerMap[row.assigned_by] ?? null) ?? null
          : null,
      }));

      setRows(mapped);
    },
    [applied.assigned, applied.dueDate, applied.priority, applied.search, applied.status, seesAllTasks, supabase],
  );

  const refreshTaskData = useCallback(
    async (userId: string) => {
      if (!userId) return;
      try {
        await Promise.all([loadSummary(userId), loadTasks(userId)]);
      } catch (e) {
        setError(toReadableTaskError(e));
      }
    },
    [loadSummary, loadTasks],
  );

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadSummary(currentUserId), loadTasks(currentUserId)]);
    } catch (reloadError) {
      const msg = reloadError instanceof Error ? reloadError.message : String(reloadError);
      if (isMissingTasksTableMessage(msg)) {
        setTasksTableMissing(true);
        setRows([]);
        setSummary({ total: 0, pending: 0, inProgress: 0, completed: 0 });
        setError(null);
      } else {
        setError(toReadableTaskError(reloadError));
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadSummary, loadTasks]);

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw new Error(userError.message);
        if (!user?.id) throw new Error("Unable to resolve current user.");
        setCurrentUserId(user.id);
        await loadAssignees();
        if (isAdmin || isManager) await loadProjectsForForm();
      } catch (bootstrapError) {
        setError(toReadableTaskError(bootstrapError));
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [isAdmin, isManager, loadAssignees, loadProjectsForForm, supabase]);

  const projectPrefillDone = useRef(false);
  useEffect(() => {
    const pid = searchParams.get("project");
    if (!(isAdmin || isManager) || !pid || tasksTableMissing || !currentUserId || projectPrefillDone.current) return;
    projectPrefillDone.current = true;
    assigneeBeforeEditRef.current = null;
    setEditId(null);
    setForm({ ...initialForm, project_id: pid });
    setPanelOpen(true);
  }, [currentUserId, isAdmin, isManager, searchParams, tasksTableMissing]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!currentUserId || tasksTableMissing) return;
    const channel = supabase
      .channel("task-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        void refreshTaskData(currentUserId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, refreshTaskData, supabase, tasksTableMissing]);

  useEffect(() => {
    return () => {
      Object.values(progressDebounceRef.current).forEach((t) => clearTimeout(t));
    };
  }, []);

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => {
        const name = employee.full_name || employee.email || "Unnamed";
        const dept = employee.department?.trim();
        const label = dept ? `${name} — ${dept}` : name;
        return { id: employee.id, label };
      }),
    [employees],
  );

  const employeeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((employee) => {
      map[employee.id] = employee.full_name || employee.email || "Unknown";
    });
    return map;
  }, [employees]);

  const overdueCount = useMemo(() => {
    const today = todayDateKey();
    return rows.filter((task) => task.due_date && task.due_date < today && task.status !== "Completed").length;
  }, [rows]);

  const dueTodayCount = useMemo(() => {
    const today = todayDateKey();
    return rows.filter((task) => task.due_date === today).length;
  }, [rows]);

  const applyFilters = () => {
    setApplied({
      status: statusFilter,
      priority: priorityFilter,
      assigned: assignedFilter,
      dueDate: dueDateFilter,
      search: searchText.trim(),
    });
  };

  const resetFilters = () => {
    setStatusFilter("");
    setPriorityFilter("");
    setAssignedFilter("");
    setDueDateFilter("");
    setSearchText("");
    setApplied({ status: "", priority: "", assigned: "", dueDate: "", search: "" });
  };

  const notifyAssigneeInApp = useCallback(
    async (taskId: string) => {
      try {
        const { error } = await supabase.rpc("create_task_assignment_notification", { p_task_id: taskId });
        if (error) console.warn("create_task_assignment_notification:", error.message);
      } catch (e) {
        console.warn("create_task_assignment_notification", e);
      }
    },
    [supabase],
  );

  const openCreate = async () => {
    if (tasksTableMissing) return;
    setError(null);
    setSuccess(null);
    assigneeBeforeEditRef.current = null;
    setEditId(null);
    try {
      await loadAssignees();
    } catch (assigneeLoadError) {
      setError(toReadableTaskError(assigneeLoadError));
    }
    if (isEmployee) {
      if (!currentUserId) return;
      setForm({ ...initialForm, assigned_to: currentUserId });
    } else {
      setForm(initialForm);
    }
    setPanelOpen(true);
  };

  const openEdit = async (task: TaskRecord) => {
    if (!canManageTasks || tasksTableMissing) return;
    setError(null);
    try {
      await loadAssignees();
    } catch (assigneeLoadError) {
      setError(toReadableTaskError(assigneeLoadError));
    }
    assigneeBeforeEditRef.current = task.assigned_to;
    setEditId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      assigned_to: task.assigned_to,
      project_id: task.project_id ?? "",
      priority: task.priority,
      status: task.status,
      start_date: task.start_date ?? "",
      due_date: task.due_date ?? "",
      progress: task.progress,
    });
    setPanelOpen(true);
  };

  const handleSaveTask = async () => {
    if (tasksTableMissing) return;
    if (isEmployee) {
      if (editId) {
        setError("Use the task list to update status and progress. Ask an admin or manager to change title, dates, or assignee.");
        return;
      }
      if (!currentUserId) {
        setError("Session not ready; try again in a moment.");
        return;
      }
      if (!form.title.trim()) {
        setError("Please enter a task title.");
        return;
      }
      if (!form.assigned_to.trim()) {
        setError("Select an employee to assign this task to (yourself or a teammate).");
        return;
      }
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const employeePayload = {
        title: form.title.trim(),
        description: form.description || null,
        assigned_to: form.assigned_to.trim(),
        assigned_by: currentUserId,
        project_id: null as string | null,
        priority: form.priority,
        status: form.status,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        progress: form.progress,
      };
      try {
        const { data: inserted, error: insertError } = await supabase.from("tasks").insert(employeePayload).select("id").single();
        if (insertError) throw new Error(insertError.message);
        setSuccess("Task assigned.");
        setPanelOpen(false);
        setForm(initialForm);
        await reload();
        if (inserted?.id) void notifyAssigneeInApp(inserted.id);
      } catch (saveError) {
        setError(toReadableTaskError(saveError));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!canManageTasks) {
      setError("You do not have permission to assign tasks here.");
      return;
    }
    if (!currentUserId) {
      setError("Session not ready; try again in a moment.");
      return;
    }
    if (!form.title.trim()) {
      setError("Please enter a task title.");
      return;
    }
    if (!form.assigned_to.trim()) {
      setError("Select an employee to assign this task to.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const basePayload = {
      title: form.title.trim(),
      description: form.description || null,
      assigned_to: form.assigned_to,
      project_id: form.project_id.trim() || null,
      priority: form.priority,
      status: form.status,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      progress: form.progress,
    };
    try {
      if (editId) {
        const priorAssignee = assigneeBeforeEditRef.current;
        const savedTaskId = editId;
        const updatePayload: typeof basePayload & { assigned_by?: string } = { ...basePayload };
        if (priorAssignee !== null && basePayload.assigned_to !== priorAssignee) {
          updatePayload.assigned_by = currentUserId;
        }
        const { error: updateError } = await supabase.from("tasks").update(updatePayload).eq("id", editId);
        if (updateError) throw new Error(updateError.message);
        setSuccess("Task updated successfully.");
        assigneeBeforeEditRef.current = null;
        setPanelOpen(false);
        setForm(initialForm);
        setEditId(null);
        await reload();
        if (priorAssignee !== basePayload.assigned_to) {
          void notifyAssigneeInApp(savedTaskId);
        }
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("tasks")
          .insert({ ...basePayload, assigned_by: currentUserId })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        setSuccess("Task assigned successfully.");
        setPanelOpen(false);
        setForm(initialForm);
        setEditId(null);
        await reload();
        if (inserted?.id) void notifyAssigneeInApp(inserted.id);
      }
    } catch (saveError) {
      setError(toReadableTaskError(saveError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!canManageTasks || tasksTableMissing) return;
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) return;
    const { error: deleteError } = await supabase.from("tasks").delete().eq("id", taskId);
    if (deleteError) {
      setError(toReadableTaskError(deleteError));
      return;
    }
    setSuccess("Task deleted successfully.");
    await reload();
  };

  const persistEmployeeTaskUpdate = useCallback(
    async (taskId: string, status: TaskStatus, progress: number) => {
      if (tasksTableMissing) return;
      const { error: updateError } = await supabase.from("tasks").update({ status, progress }).eq("id", taskId);
      if (updateError) {
        setError(toReadableTaskError(updateError));
        return;
      }
      setSuccess("Task updated.");
      await refreshTaskData(currentUserId);
    },
    [currentUserId, refreshTaskData, supabase, tasksTableMissing],
  );

  const handleEmployeeStatusChange = async (taskId: string, status: TaskStatus, progress: number) => {
    setRows((prev) => prev.map((task) => (task.id === taskId ? { ...task, status } : task)));
    await persistEmployeeTaskUpdate(taskId, status, progress);
  };

  const handleEmployeeProgressAdjust = (taskId: string, status: TaskStatus, progress: number) => {
    setRows((prev) => prev.map((task) => (task.id === taskId ? { ...task, progress } : task)));
    if (progressDebounceRef.current[taskId]) clearTimeout(progressDebounceRef.current[taskId]);
    progressDebounceRef.current[taskId] = setTimeout(() => {
      void persistEmployeeTaskUpdate(taskId, status, progress);
      delete progressDebounceRef.current[taskId];
    }, 450);
  };

  const handleCompleteTaskSubmit = async (summary: string) => {
    if (!completeTask || !currentUserId) return;
    setCompleteSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          status: "Completed",
          progress: 100,
          completion_summary: summary.trim(),
        })
        .eq("id", completeTask.id)
        .eq("assigned_to", currentUserId);

      if (updateError) throw new Error(updateError.message);

      const { error: rpcError } = await supabase.rpc("create_task_completed_notification", {
        p_task_id: completeTask.id,
      });
      if (rpcError) console.warn("create_task_completed_notification:", rpcError.message);

      setCompleteTask(null);
      setSuccess("Task completed. Your summary was saved; your assigner gets an in-app notification.");
      await reload();
    } catch (e) {
      setError(toReadableTaskError(e));
    } finally {
      setCompleteSubmitting(false);
    }
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Task Assignment</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {isManager
              ? "Assign work to your team, edit tasks, and monitor progress — same task list your reports see when they are assignees."
              : isEmployee
                ? "Admins and managers assign work to your user account; it appears here. You can also assign tasks to yourself or teammates in your department or shared projects."
                : "Assign, track and manage employee tasks"}
          </p>
        </div>
        {isAdmin || isManager || isEmployee ? (
          <Button
            data-requires-online
            onClick={() => void openCreate()}
            disabled={tasksTableMissing}
            className="h-9 rounded-full bg-[#2563eb] px-4 text-white hover:bg-[#1d4ed8] disabled:opacity-50"
          >
            + Assign task
          </Button>
        ) : null}
      </div>

      {tasksTableMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#eff6ff] px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Database setup required</p>
          <p className="mt-1 text-blue-800/90">
            The <code className="rounded bg-white/80 px-1">public.tasks</code> table is not available in this Supabase project. Open the SQL
            Editor for the project linked to this app (same URL as <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_SUPABASE_URL</code>),
            run the script <strong>BB_internal_SB/task_schema.sql</strong>, then refresh. See <strong>DATABASE_SETUP_ORDER.txt</strong> for full
            script order.
          </p>
        </div>
      ) : null}

      {error ? <Alert tone="error" text={error} /> : null}
      {success ? <Alert tone="success" text={success} /> : null}

      <div className="stat-cards-grid">
        <LeadSummaryCard title="Total Tasks" value={summary.total} loading={loading} />
        <LeadSummaryCard title="Pending Tasks" value={summary.pending} loading={loading} />
        <LeadSummaryCard title="In Progress Tasks" value={summary.inProgress} loading={loading} />
        <LeadSummaryCard title="Completed Tasks" value={summary.completed} loading={loading} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:px-4 sm:text-sm">
          Overdue: {tasksTableMissing ? 0 : overdueCount}
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 sm:px-4 sm:text-sm">
          Due today: {tasksTableMissing ? 0 : dueTodayCount}
        </div>
      </div>

      <CollapsibleFilterPanel title="Filter tasks">
        <div className="responsive-filter-grid">
          <FilterField label="Status">
            <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "")}
            disabled={tasksTableMissing}
              className="h-10 w-full rounded-xl border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#eff3f8]"
            >
              <option value="">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </FilterField>
          <FilterField label="Priority">
            <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | "")}
            disabled={tasksTableMissing}
              className="h-10 w-full rounded-xl border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#eff3f8]"
            >
              <option value="">All priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </FilterField>
          <FilterField label="Assigned to">
            <select
            value={assignedFilter}
            onChange={(event) => setAssignedFilter(event.target.value)}
            disabled={!seesAllTasks || tasksTableMissing}
              className="h-10 w-full rounded-xl border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#eff3f8]"
            >
              <option value="">All employees</option>
              {employeeOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Due date">
            <Input
              type="date"
              value={dueDateFilter}
              onChange={(event) => setDueDateFilter(event.target.value)}
              disabled={tasksTableMissing}
              aria-label="Due date"
              className="h-10 border-[#d4deea] bg-white disabled:bg-[#eff3f8]"
            />
          </FilterField>
          <FilterField label="Search">
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search task title…"
              disabled={tasksTableMissing}
              className="h-10 border-[#d4deea] bg-white disabled:bg-[#eff3f8]"
            />
          </FilterField>
          <div className="col-span-2 flex gap-2 lg:col-span-1">
            <Button
              onClick={applyFilters}
              disabled={tasksTableMissing}
              className="h-11 flex-1 rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8] disabled:opacity-50 sm:h-9"
            >
              Apply Filters
            </Button>
            <Button
              onClick={resetFilters}
              variant="outline"
              disabled={tasksTableMissing}
              className="h-11 flex-1 rounded-xl border-[#c9d8eb] bg-white text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50 sm:h-9"
            >
              Reset
            </Button>
          </div>
        </div>
      </CollapsibleFilterPanel>

      <div className="responsive-table-wrap">
        <TaskTable
          tasks={rows}
          loading={loading}
          tableMissing={tasksTableMissing}
          employeeNameMap={employeeNameMap}
          canManageTasks={canManageTasks}
          onView={(task) => setViewTask(task)}
          onEdit={(task) => void openEdit(task)}
          onDelete={(taskId) => void handleDeleteTask(taskId)}
          onEmployeeStatusChange={(taskId, status, progress) => void handleEmployeeStatusChange(taskId, status, progress)}
          onEmployeeProgressChange={(taskId, status, progress) => handleEmployeeProgressAdjust(taskId, status, progress)}
          onRequestCompleteTask={!canManageTasks ? (task) => setCompleteTask(task) : undefined}
        />
      </div>

      <TaskCompleteDialog
        task={completeTask}
        submitting={completeSubmitting}
        onClose={() => !completeSubmitting && setCompleteTask(null)}
        onSubmit={handleCompleteTaskSubmit}
      />

      {viewTask ? (
        <TaskViewPanel task={viewTask} employeeNameMap={employeeNameMap} onClose={() => setViewTask(null)} />
      ) : null}

      {panelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close panel overlay"
            onClick={() => setPanelOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]"
          />
          <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[440px] lg:max-w-[100vw]">
            <div className="flex shrink-0 items-center justify-between border-b border-[#e8edf5] px-4 py-4 sm:px-5">
              <h3 className="text-lg font-semibold text-[#0f172a]">{editId ? "Edit Task" : "Assign Task"}</h3>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="touch-target flex items-center justify-center rounded-full border border-[#d4deea] bg-white p-2 text-[#1e3a8a] shadow-sm transition hover:bg-[#eff6ff] active:scale-95"
              >
                <span className="flex h-5 w-5 items-center justify-center text-lg font-semibold leading-none">×</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <TaskForm
                open={panelOpen}
                title={editId ? "Edit Task" : "Assign task"}
                value={form}
                employees={employeeOptions}
                projects={projectOptions}
                showProjectField={canManageTasks}
                assigneeLockedToSelf={false}
                assigneeHelperText={
                  isEmployee
                    ? "All active employees, managers, and admins are listed. Choose who should own this task."
                    : "List refreshes when you open this panel. Active employees, managers, and admins who can receive tasks are shown."
                }
                submitting={submitting}
                onChange={setForm}
                onClose={() => setPanelOpen(false)}
                onSubmit={() => void handleSaveTask()}
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function TaskViewPanel({
  task,
  employeeNameMap,
  onClose,
}: {
  task: TaskRecord;
  employeeNameMap: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={onClose} />
      <div className="fixed inset-y-6 right-4 z-[61] mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-[24px] border border-[#d4deea] bg-white shadow-2xl sm:right-10">
        <div className="flex items-start justify-between border-b border-[#e8edf5] px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a]">{task.title}</h3>
            <p className="mt-1 text-xs text-[#64748b]">Assigned to {employeeNameMap[task.assigned_to] || "—"}</p>
            {task.assigner_display_name ? (
              <p className="mt-0.5 text-xs text-[#64748b]">Assigned by {task.assigner_display_name}</p>
            ) : null}
          </div>
          <button type="button" className="text-sm text-[#64748b]" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm text-[#334155]">
          <div>
            <p className="text-xs font-semibold uppercase text-[#94a3b8]">Description</p>
            <p className="mt-1 whitespace-pre-wrap">{task.description?.trim() ? task.description : "—"}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-[#94a3b8]">Status</dt>
              <dd className="font-medium">{task.status}</dd>
            </div>
            <div>
              <dt className="text-[#94a3b8]">Priority</dt>
              <dd className="font-medium">{task.priority}</dd>
            </div>
            <div>
              <dt className="text-[#94a3b8]">Start</dt>
              <dd className="font-medium">{task.start_date || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#94a3b8]">Due</dt>
              <dd className="font-medium">{task.due_date || "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[#94a3b8]">Progress</dt>
              <dd className="font-medium">{task.progress}%</dd>
            </div>
            {task.status === "Completed" && task.completion_summary?.trim() ? (
              <div className="col-span-2">
                <dt className="text-[#94a3b8]">Completion summary</dt>
                <dd className="mt-1 whitespace-pre-wrap font-medium">{task.completion_summary}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </>
  );
}

function Alert({ tone, text }: { tone: "error" | "success"; text: string }) {
  return (
    <div
      className={[
        "rounded-xl border px-4 py-2 text-sm",
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {text}
    </div>
  );
}
