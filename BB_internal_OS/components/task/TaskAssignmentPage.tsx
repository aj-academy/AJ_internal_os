"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/client-lead/LeadSummaryCard";
import { TaskForm, type TaskFormValue } from "@/components/task/TaskForm";
import { TaskTable } from "@/components/task/TaskTable";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

type AppRole = "admin" | "employee";

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
  priority: "Medium",
  status: "Pending",
  start_date: "",
  due_date: "",
  progress: 0,
};

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function toReadableTaskError(input: unknown) {
  const raw = input instanceof Error ? input.message : "Unexpected error.";
  if (raw.includes("Could not find the table 'public.tasks'")) {
    return "Supabase table `public.tasks` is missing. Run `task_schema.sql` in Supabase SQL Editor, then refresh.";
  }
  return raw;
}

export function TaskAssignmentPage({ role }: TaskAssignmentPageProps) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = role === "admin";
  const [currentUserId, setCurrentUserId] = useState("");
  const [employees, setEmployees] = useState<ProfileOption[]>([]);
  const [rows, setRows] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [summary, setSummary] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormValue>(initialForm);

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

  const loadEmployees = useCallback(async () => {
    const { data, error: profilesError } = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("role", ["employee", "manager"])
      .eq("status", "active")
      .order("full_name", { ascending: true })
      .returns<ProfileOption[]>();
    if (profilesError) throw new Error(profilesError.message);
    setEmployees(data ?? []);
  }, [supabase]);

  const loadSummary = useCallback(
    async (userId: string) => {
      let totalQuery = supabase.from("tasks").select("id", { count: "exact", head: true });
      let pendingQuery = supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "Pending");
      let inProgressQuery = supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "In Progress");
      let completedQuery = supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "Completed");

      if (!isAdmin) {
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
      if (summaryError) throw new Error(summaryError.message);

      setSummary({
        total: totalRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        inProgress: inProgressRes.count ?? 0,
        completed: completedRes.count ?? 0,
      });
    },
    [isAdmin, supabase],
  );

  const loadTasks = useCallback(
    async (userId: string) => {
      let query = supabase
        .from("tasks")
        .select("id,title,description,assigned_to,priority,status,start_date,due_date,progress,created_at,updated_at");

      if (!isAdmin) query = query.eq("assigned_to", userId);
      if (applied.status) query = query.eq("status", applied.status);
      if (applied.priority) query = query.eq("priority", applied.priority);
      if (applied.assigned) query = query.eq("assigned_to", applied.assigned);
      if (applied.dueDate) query = query.eq("due_date", applied.dueDate);
      if (applied.search) query = query.ilike("title", `%${applied.search}%`);

      query = query.order("due_date", { ascending: true, nullsFirst: false });

      const { data, error: taskError } = await query;
      if (taskError) throw new Error(taskError.message);
      setRows((data as TaskRecord[] | null) ?? []);
    },
    [applied.assigned, applied.dueDate, applied.priority, applied.search, applied.status, isAdmin, supabase],
  );

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setError(null);
    setLoading(true);
    try {
      await Promise.all([loadSummary(currentUserId), loadTasks(currentUserId)]);
    } catch (reloadError) {
      setError(toReadableTaskError(reloadError));
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
      } catch (bootstrapError) {
        setError(toReadableTaskError(bootstrapError));
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [loadEmployees, supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel("task-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        void reload();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, reload, supabase]);

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
    setError(null);
    setSuccess(null);
    setEditId(null);
    setForm(initialForm);
    setPanelOpen(true);
  };

  const openEdit = (task: TaskRecord) => {
    if (!isAdmin) return;
    setEditId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? "",
      assigned_to: task.assigned_to,
      priority: task.priority,
      status: task.status,
      start_date: task.start_date ?? "",
      due_date: task.due_date ?? "",
      progress: task.progress,
    });
    setPanelOpen(true);
  };

  const handleSaveTask = async () => {
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
    if (!isAdmin) return;
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

  const handleEmployeeUpdate = async (taskId: string, status: TaskStatus, progress: number) => {
    const { error: updateError } = await supabase.from("tasks").update({ status, progress }).eq("id", taskId);
    if (updateError) {
      setError(toReadableTaskError(updateError));
      return;
    }
    setRows((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, status, progress } : task)),
    );
  };

  const handleViewTask = (task: TaskRecord) => {
    window.alert(`Task: ${task.title}\nDescription: ${task.description ?? "-"}\nStatus: ${task.status}\nProgress: ${task.progress}%`);
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Task Assignment</h2>
          <p className="mt-1 text-sm text-[#64748b]">Assign, track and manage employee tasks</p>
        </div>
        {isAdmin ? (
          <Button onClick={openCreate} className="h-9 rounded-full bg-[#2563eb] px-4 text-white hover:bg-[#1d4ed8]">
            + Assign Task
          </Button>
        ) : null}
      </div>

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
          Overdue Tasks Count: {overdueCount}
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Today&apos;s Tasks: {dueTodayCount}
        </div>
      </div>

      <article className="rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "")}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
          >
            <option value="">Status</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | "")}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb]"
          >
            <option value="">Priority</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
          <select
            value={assignedFilter}
            onChange={(event) => setAssignedFilter(event.target.value)}
            disabled={!isAdmin}
            className="h-9 rounded-lg border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] disabled:bg-[#eff3f8]"
          >
            <option value="">Assigned Employee</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.label}
              </option>
            ))}
          </select>
          <Input type="date" value={dueDateFilter} onChange={(event) => setDueDateFilter(event.target.value)} className="h-9 border-[#d4deea] bg-white" />
          <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search task title" className="h-9 border-[#d4deea] bg-white" />
          <Button onClick={applyFilters} variant="outline" className="h-9 rounded-full border-[#c9d8eb] bg-white text-[#1e3a8a] hover:bg-[#eff6ff]">
            Apply Filters
          </Button>
          <Button onClick={resetFilters} variant="outline" className="h-9 rounded-full border-[#c9d8eb] bg-white text-[#475569] hover:bg-[#f8fafc]">
            Reset
          </Button>
        </div>
      </article>

      <TaskTable
        tasks={rows}
        loading={loading}
        employeeNameMap={employeeNameMap}
        isAdmin={isAdmin}
        onView={handleViewTask}
        onEdit={openEdit}
        onDelete={(taskId) => void handleDeleteTask(taskId)}
        onEmployeeUpdate={(taskId, status, progress) => void handleEmployeeUpdate(taskId, status, progress)}
      />

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
