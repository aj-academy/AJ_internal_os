"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/client-lead/LeadSummaryCard";
import { TaskForm, type TaskFormValue } from "@/components/task/TaskForm";
import { TaskTable } from "@/components/task/TaskTable";
import { TaskCompleteDialog } from "@/components/task/TaskCompleteDialog";
import { assignerDisplayFromProfile } from "@/lib/notifications/taskAssignmentEmail";
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
  const [emailNotifyHint, setEmailNotifyHint] = useState<string | null>(null);
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

  const postTaskAssignedNotification = useCallback(async (taskId: string, previousAssigneeId: string | null) => {
    try {
      const res = await fetch("/api/notifications/task-assigned", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, previousAssigneeId }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        skipped?: boolean;
        reason?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        console.warn("Task assignment notification:", payload?.error ?? res.statusText);
        setEmailNotifyHint(
          payload?.error
            ? `Assignee email was not sent: ${payload.error}`
            : "Assignee email was not sent (notification request failed). Check the browser console.",
        );
        return;
      }
      if (payload?.skipped) {
        const r = payload.reason;
        if (r === "RESEND_API_KEY not set") {
          setEmailNotifyHint(
            "Assignee email was not sent: add RESEND_API_KEY (and optionally TASK_EMAIL_FROM) in Vercel → Environment Variables, then redeploy.",
          );
        } else if (r === "Assignee has no email on profile") {
          setEmailNotifyHint(
            "Assignee email was not sent: that user’s row in public.profiles has no email. Sync email from Supabase Auth or set profiles.email, then try again.",
          );
        } else if (r === "no_reassignment_or_self_assign") {
          setEmailNotifyHint(
            "No assignee email: the assignee did not change, or the task stayed assigned to you. New assignees get an email when someone else is assigned.",
          );
        } else if (r) {
          setEmailNotifyHint(`Assignee email was not sent: ${r}`);
        } else {
          setEmailNotifyHint(
            "No assignee email sent (assignee unchanged or notification not configured).",
          );
        }
        return;
      }
      setEmailNotifyHint(null);
    } catch (e) {
      console.warn("Task assignment notification request failed", e);
      setEmailNotifyHint("Assignee email was not sent (network error). Check the browser console.");
    }
  }, []);

  const openCreate = async () => {
    if (tasksTableMissing) return;
    setError(null);
    setSuccess(null);
    setEmailNotifyHint(null);
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
    setEmailNotifyHint(null);
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
      setEmailNotifyHint(null);
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
        if (inserted?.id) void postTaskAssignedNotification(inserted.id, null);
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
    setEmailNotifyHint(null);
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
        void postTaskAssignedNotification(savedTaskId, priorAssignee);
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
        if (inserted?.id) void postTaskAssignedNotification(inserted.id, null);
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
    if (!completeTask) return;
    setCompleteSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/task-complete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: completeTask.id, summary }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; taskUpdated?: boolean };
      if (!res.ok) {
        if (body.taskUpdated) await reload();
        throw new Error(body.error || "Could not complete task.");
      }
      setCompleteTask(null);
      setSuccess("Task completed. Your summary was saved; the assigner is emailed when mail is configured.");
      await reload();
    } catch (e) {
      setError(toReadableTaskError(e));
    } finally {
      setCompleteSubmitting(false);
    }
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
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
      {emailNotifyHint ? <Alert tone="warning" text={emailNotifyHint} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LeadSummaryCard title="Total Tasks" value={summary.total} loading={loading} />
        <LeadSummaryCard title="Pending Tasks" value={summary.pending} loading={loading} />
        <LeadSummaryCard title="In Progress Tasks" value={summary.inProgress} loading={loading} />
        <LeadSummaryCard title="Completed Tasks" value={summary.completed} loading={loading} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          Overdue Tasks Count: {tasksTableMissing ? 0 : overdueCount}
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Today&apos;s Tasks: {tasksTableMissing ? 0 : dueTodayCount}
        </div>
      </div>

      <article className="rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "")}
            disabled={tasksTableMissing}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#eff3f8]"
          >
            <option value="">Status</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | "")}
            disabled={tasksTableMissing}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#eff3f8]"
          >
            <option value="">Priority</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
          <select
            value={assignedFilter}
            onChange={(event) => setAssignedFilter(event.target.value)}
            disabled={!seesAllTasks || tasksTableMissing}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#eff3f8]"
          >
            <option value="">Assigned Employee</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={dueDateFilter}
            onChange={(event) => setDueDateFilter(event.target.value)}
            disabled={tasksTableMissing}
            className="h-9 border-[#d4deea] bg-white disabled:bg-[#eff3f8]"
          />
          <Input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search task title"
            disabled={tasksTableMissing}
            className="h-9 border-[#d4deea] bg-white disabled:bg-[#eff3f8]"
          />
          <Button
            onClick={applyFilters}
            variant="outline"
            disabled={tasksTableMissing}
            className="h-9 rounded-full border-[#c9d8eb] bg-white text-[#1e3a8a] hover:bg-[#eff6ff] disabled:opacity-50"
          >
            Apply Filters
          </Button>
          <Button
            onClick={resetFilters}
            variant="outline"
            disabled={tasksTableMissing}
            className="h-9 rounded-full border-[#c9d8eb] bg-white text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50"
          >
            Reset
          </Button>
        </div>
      </article>

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
            className="fixed inset-0 z-40 bg-slate-900/20"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] p-3 sm:p-4">
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
                  ? "Teammates in your department or on the same project roster as you appear here. If the list is empty, ask HR to set your department or add you to a project team."
                  : "List refreshes when you open this panel. Active employees, managers, and admins who can receive tasks are shown."
              }
              submitting={submitting}
              onChange={setForm}
              onClose={() => setPanelOpen(false)}
              onSubmit={() => void handleSaveTask()}
            />
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

function Alert({ tone, text }: { tone: "error" | "success" | "warning"; text: string }) {
  return (
    <div
      className={[
        "rounded-xl border px-4 py-2 text-sm",
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : tone === "warning"
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-emerald-200 bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {text}
    </div>
  );
}
