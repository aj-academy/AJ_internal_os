"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/client-lead/LeadSummaryCard";
import { TaskForm, type TaskFormValue } from "@/components/task/TaskForm";
import { TaskTable } from "@/components/task/TaskTable";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

type AppRole = "admin" | "employee" | "manager";

interface TaskAssignmentPageProps {
  role: AppRole;
}

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string | null;
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
    (m.includes("pgrst205") && m.includes("tasks"))
  );
}

function toReadableTaskError(input: unknown) {
  const raw = input instanceof Error ? input.message : "Unexpected error.";
  if (isMissingTasksTableMessage(raw)) {
    return "DATABASE_SETUP: The `public.tasks` table is not in this Supabase project yet. In Supabase SQL Editor, run `BB_internal_SB/task_schema.sql` (see DATABASE_SETUP_ORDER.txt), then refresh this page.";
  }
  return raw;
}

export function TaskAssignmentPage({ role }: TaskAssignmentPageProps) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const seesAllTasks = isAdmin || isManager;
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

  const loadEmployees = useCallback(async () => {
    const { data, error: profilesError } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("role", ["employee", "manager", "admin", "super_admin"])
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .returns<ProfileOption[]>();
    if (profilesError) throw new Error(profilesError.message);
    setEmployees(data ?? []);
  }, [supabase]);

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
        .select("id,title,description,assigned_to,priority,status,start_date,due_date,progress,project_id,created_at,updated_at");

      if (!seesAllTasks) query = query.eq("assigned_to", userId);
      if (applied.status) query = query.eq("status", applied.status);
      if (applied.priority) query = query.eq("priority", applied.priority);
      if (applied.assigned) query = query.eq("assigned_to", applied.assigned);
      if (applied.dueDate) query = query.eq("due_date", applied.dueDate);
      if (applied.search) query = query.ilike("title", `%${applied.search}%`);

      query = query.order("due_date", { ascending: true, nullsFirst: false });

      const { data, error: taskError } = await query.returns<TaskRecord[]>();
      if (taskError) {
        if (isMissingTasksTableMessage(taskError.message)) {
          setTasksTableMissing(true);
          setRows([]);
          return;
        }
        throw new Error(taskError.message);
      }
      setTasksTableMissing(false);
      setRows(data ?? []);
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
        await loadEmployees();
        if (isAdmin) await loadProjectsForForm();
      } catch (bootstrapError) {
        setError(toReadableTaskError(bootstrapError));
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [isAdmin, loadEmployees, loadProjectsForForm, supabase]);

  const projectPrefillDone = useRef(false);
  useEffect(() => {
    const pid = searchParams.get("project");
    if (!isAdmin || !pid || tasksTableMissing || !currentUserId || projectPrefillDone.current) return;
    projectPrefillDone.current = true;
    setEditId(null);
    setForm({ ...initialForm, project_id: pid });
    setPanelOpen(true);
  }, [currentUserId, isAdmin, searchParams, tasksTableMissing]);

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
      employees.map((employee) => ({
        id: employee.id,
        label: employee.full_name || employee.email || "Unnamed Employee",
      })),
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

  const openCreate = () => {
    if (tasksTableMissing) return;
    setError(null);
    setSuccess(null);
    setEditId(null);
    setForm(initialForm);
    setPanelOpen(true);
  };

  const openEdit = (task: TaskRecord) => {
    if (!isAdmin || tasksTableMissing) return;
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
    if (!isAdmin) {
      setError("Only admins can assign/edit tasks from this form.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const payload = {
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
        const { error: updateError } = await supabase.from("tasks").update(payload).eq("id", editId);
        if (updateError) throw new Error(updateError.message);
        setSuccess("Task updated successfully.");
      } else {
        const { error: insertError } = await supabase.from("tasks").insert(payload);
        if (insertError) throw new Error(insertError.message);
        setSuccess("Task assigned successfully.");
      }
      setPanelOpen(false);
      setForm(initialForm);
      setEditId(null);
      await reload();
    } catch (saveError) {
      setError(toReadableTaskError(saveError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!isAdmin || tasksTableMissing) return;
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

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Task Assignment</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {isManager ? "View and monitor team tasks (create and edit remain admin-only)." : "Assign, track and manage employee tasks"}
          </p>
        </div>
        {isAdmin ? (
          <Button
            onClick={openCreate}
            disabled={tasksTableMissing}
            className="h-9 rounded-full bg-[#2563eb] px-4 text-white hover:bg-[#1d4ed8] disabled:opacity-50"
          >
            + Assign Task
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
        isAdmin={isAdmin}
        onView={(task) => setViewTask(task)}
        onEdit={openEdit}
        onDelete={(taskId) => void handleDeleteTask(taskId)}
        onEmployeeStatusChange={(taskId, status, progress) => void handleEmployeeStatusChange(taskId, status, progress)}
        onEmployeeProgressChange={(taskId, status, progress) => handleEmployeeProgressAdjust(taskId, status, progress)}
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
              title={editId ? "Edit Task" : "Assign Task"}
              value={form}
              employees={employeeOptions}
              projects={projectOptions}
              showProjectField={isAdmin}
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
