"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { BulkSelectionBar } from "@/components/ui/BulkSelectionBar";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/ui/LeadSummaryCard";
import { TaskForm, type TaskFormValue } from "@/components/task/TaskForm";
import { TaskTable } from "@/components/task/TaskTable";
import { TaskCompleteDialog } from "@/components/task/TaskCompleteDialog";
import { TaskAttachmentUpload } from "@/components/task/TaskAttachmentUpload";
import type { AssigneeProfile } from "@/components/task/TaskAssigneePicker";
import { usePagination } from "@/lib/usePagination";
import { useRowSelection } from "@/lib/useRowSelection";
import { assignerDisplayFromProfile } from "@/lib/profileDisplayName";
import { parseTaskAttachments, uploadTaskAttachments, type TaskAttachment } from "@/lib/taskAttachments";
import { fetchTaskActivities, logTaskActivity, parseClientIds, type TaskActivityRow } from "@/lib/taskActivities";
import { displayLeadName } from "@/components/employee/leads/employeeLeadConfig";
import {
  consumeTaskAssignDraft,
  consumeTaskLeadSelection,
  saveTaskAssignDraft,
} from "@/lib/taskLeadPickStorage";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

type AppRole = "admin" | "employee" | "student" | "freelancer" | "mentor";

/** assignee = tasks assigned to me; assigner = department-scoped task assignment (mentor / freelancer). */
export type TaskAssignmentVariant = "assignee" | "assigner";

type EmployeeTaskView = "assigned-to-me" | "assigned-by-me";

interface TaskAssignmentPageProps {
  role: AppRole;
  variant?: TaskAssignmentVariant;
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
  assignment_type: "",
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
    (m.includes("column") &&
      m.includes("tasks") &&
      (m.includes("assigned_by") ||
        m.includes("completion_summary") ||
        m.includes("completion_attachment_urls") ||
        m.includes("client_ids") ||
        m.includes("assignment_type")))
  );
}

function toReadableTaskError(input: unknown) {
  const raw = input instanceof Error ? input.message : "Unexpected error.";
  if (isMissingTasksTableMessage(raw)) {
    return "DATABASE_SETUP: The `public.tasks` table is not in this Supabase project yet. In Supabase SQL Editor, run `AJ_Academy_SB/task_schema.sql` (see DATABASE_SETUP_ORDER.txt), then refresh this page.";
  }
  if (
    raw.toLowerCase().includes("get_team_assignees") ||
    raw.toLowerCase().includes("get_task_assignees") ||
    raw.toLowerCase().includes("tasks_employee_may_assign_to") ||
    raw.toLowerCase().includes("client_ids") ||
    raw.toLowerCase().includes("assignment_type")
  ) {
    return "DATABASE_SETUP: Re-run `AJ_Academy_SB/task_schema.sql` and `AJ_Academy_SB/tasks_assignment_link_patch.sql` in Supabase, then refresh.";
  }
  return raw;
}

export function TaskAssignmentPage({ role, variant }: TaskAssignmentPageProps) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = role === "admin";
  const isEmployee = role === "employee";
  const isStudent = role === "student";
  const isMentor = role === "mentor";
  const isFreelancer = role === "freelancer";
  const resolvedVariant: TaskAssignmentVariant =
    variant ?? (isMentor || isFreelancer ? "assigner" : "assignee");
  const isAssigneeView = resolvedVariant === "assignee";
  const isMember = role === "student" || isEmployee || isFreelancer || isMentor;
  const seesAllTasks = isAdmin;
  const departmentAssigner =
    (isMentor || isFreelancer) && resolvedVariant === "assigner";
  const canManageTasks = isAdmin || departmentAssigner;
  const mentorManagesTeam = departmentAssigner;
  const isPortalAssignee = isAssigneeView && (isStudent || isMentor || isFreelancer);
  const [employeeTaskView, setEmployeeTaskView] = useState<EmployeeTaskView>("assigned-to-me");
  const employeeDelegatedView = isEmployee && employeeTaskView === "assigned-by-me";
  const filterTasksByAssigner = mentorManagesTeam || employeeDelegatedView;
  const [currentUserId, setCurrentUserId] = useState("");
  const [selfProfile, setSelfProfile] = useState<ProfileOption | null>(null);
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
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<TaskAttachment[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedLeadLabels, setSelectedLeadLabels] = useState<string[]>([]);
  const [leadSelectionPath, setLeadSelectionPath] = useState("");

  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [dueDateFilter, setDueDateFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

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
    if (role === "student") return;

    if (isEmployee) {
      const { data: rpcRows, error: rpcError } = await supabase.rpc("get_team_assignees");
      if (!rpcError && Array.isArray(rpcRows)) {
        const rows = rpcRows as {
          id: string;
          full_name: string | null;
          email: string | null;
          department?: string | null;
          role?: string | null;
        }[];
        setEmployees(
          rows.map((r) => ({
            id: r.id,
            full_name: r.full_name,
            email: r.email,
            department: r.department ?? null,
            role: r.role ?? "employee",
          })),
        );
        return;
      }
      const { data, error: profilesError } = await supabase
        .from("profiles")
        .select("id,full_name,email,department,role")
        .in("role", ["employee", "admin", "super_admin", "manager", "student", "freelancer", "mentor"])
        .or("status.is.null,status.eq.active")
        .order("full_name", { ascending: true })
        .returns<ProfileOption[]>();
      if (profilesError) throw new Error(profilesError.message);
      setEmployees(data ?? []);
      return;
    }

    if (departmentAssigner) {
      const { data: rpcRows, error: rpcError } = await supabase.rpc("get_department_task_assignees");
      if (!rpcError && Array.isArray(rpcRows)) {
        const rows = rpcRows as {
          id: string;
          full_name: string | null;
          email: string | null;
          department: string | null;
          role: string | null;
        }[];
        setEmployees(
          rows.map((r) => ({
            id: r.id,
            full_name: r.full_name,
            email: r.email,
            department: r.department,
            role: r.role,
          })),
        );
        return;
      }
      if (selfProfile?.department) {
        const { data, error: profilesError } = await supabase
          .from("profiles")
          .select("id,full_name,email,department,role")
          .eq("role", "student")
          .eq("department", selfProfile.department)
          .or("status.is.null,status.eq.active")
          .order("full_name", { ascending: true });
        if (profilesError) throw new Error(profilesError.message);
        setEmployees((data ?? []) as ProfileOption[]);
        return;
      }
      setEmployees([]);
      return;
    }

    if (isAdmin) {
      const { data, error: profilesError } = await supabase
        .from("profiles")
        .select("id,full_name,email,department,role")
        .in("role", ["student", "freelancer", "mentor", "employee", "admin", "super_admin", "manager"])
        .or("status.is.null,status.eq.active")
        .order("full_name", { ascending: true })
        .returns<ProfileOption[]>();
      if (profilesError) throw new Error(profilesError.message);
      setEmployees(data ?? []);
      return;
    }

    const { data: rpcRows, error: rpcError } = await supabase.rpc("get_task_assignees");
    if (!rpcError && Array.isArray(rpcRows)) {
      const rows = rpcRows as {
        id: string;
        full_name: string | null;
        email: string | null;
        department: string | null;
        role: string | null;
      }[];
      setEmployees(
        rows.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          email: r.email,
          department: r.department,
          role: r.role,
        })),
      );
      return;
    }
    const { data, error: profilesError } = await supabase
      .from("profiles")
      .select("id,full_name,email,department,role")
      .in("role", ["student", "freelancer", "mentor", "employee", "admin", "super_admin", "manager"])
      .or("status.is.null,status.eq.active")
      .order("full_name", { ascending: true })
      .returns<ProfileOption[]>();
    if (profilesError) throw new Error(profilesError.message);
    setEmployees(data ?? []);
  }, [departmentAssigner, isAdmin, isEmployee, role, selfProfile?.department, supabase]);

  const loadSummary = useCallback(
    async (userId: string) => {
      let totalQuery = supabase.from("tasks").select("id", { count: "exact", head: true });
      let pendingQuery = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "Pending");
      let inProgressQuery = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "In Progress");
      let completedQuery = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "Completed");

      if (filterTasksByAssigner) {
        totalQuery = totalQuery.eq("assigned_by", userId);
        pendingQuery = pendingQuery.eq("assigned_by", userId);
        inProgressQuery = inProgressQuery.eq("assigned_by", userId);
        completedQuery = completedQuery.eq("assigned_by", userId);
      } else if (!seesAllTasks) {
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
    [filterTasksByAssigner, seesAllTasks, supabase],
  );

  const loadTasks = useCallback(
    async (userId: string) => {
      let query = supabase
        .from("tasks")
        .select(
          "id,title,description,assigned_to,assignee_name,assignee_email,assigned_by,completion_summary,completion_attachment_urls,priority,status,start_date,due_date,progress,assignment_type,project_id,client_ids,attachment_urls,created_at,updated_at",
        );

      if (filterTasksByAssigner) query = query.eq("assigned_by", userId);
      else if (!seesAllTasks) query = query.eq("assigned_to", userId);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (priorityFilter) query = query.eq("priority", priorityFilter);
      if (assignedFilter) query = query.eq("assigned_to", assignedFilter);
      if (dueDateFilter) query = query.eq("due_date", dueDateFilter);
      if (searchDebounced) query = query.ilike("title", `%${searchDebounced}%`);

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
        assigned_to: string | null;
        assignee_name?: string | null;
        assignee_email?: string | null;
        assigned_by?: string | null;
        completion_summary?: string | null;
        completion_attachment_urls?: unknown;
        priority: TaskPriority;
        status: TaskStatus;
        start_date: string | null;
        due_date: string | null;
        progress: number;
        assignment_type?: "lead" | "project" | null;
        project_id?: string | null;
        client_ids?: unknown;
        attachment_urls?: unknown;
        created_at: string;
        updated_at: string;
      };

      const rawRows = (data ?? []) as Raw[];
      const assignerIds = Array.from(
        new Set(rawRows.map((r) => r.assigned_by).filter((id): id is string => Boolean(id))),
      );
      const assigneeIds = Array.from(
        new Set(rawRows.map((r) => r.assigned_to).filter((id): id is string => Boolean(id))),
      );
      let assignerMap: Record<string, { full_name: string | null; email: string | null; role: string | null; department: string | null }> = {};
      let assigneeMap: Record<string, { department: string | null }> = {};
      if (assignerIds.length) {
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id,full_name,email,role,department")
          .in("id", assignerIds);
        if (!profErr && profs) {
          assignerMap = Object.fromEntries(
            profs.map((p: { id: string; full_name: string | null; email: string | null; role: string | null; department: string | null }) => [
              p.id,
              p,
            ]),
          );
        }
      }
      if (assigneeIds.length) {
        const { data: assigneeProfs, error: assigneeErr } = await supabase
          .from("profiles")
          .select("id,department")
          .in("id", assigneeIds);
        if (!assigneeErr && assigneeProfs) {
          assigneeMap = Object.fromEntries(
            assigneeProfs.map((p: { id: string; department: string | null }) => [p.id, p]),
          );
        }
      }

      const mapped: TaskRecord[] = rawRows.map((row) => ({
        ...row,
        client_ids: parseClientIds(row.client_ids),
        attachment_urls: parseTaskAttachments(row.attachment_urls),
        completion_attachment_urls: parseTaskAttachments(row.completion_attachment_urls),
        assigner_display_name: row.assigned_by
          ? assignerDisplayFromProfile(assignerMap[row.assigned_by] ?? null) ?? null
          : null,
        assigner_department: row.assigned_by ? assignerMap[row.assigned_by]?.department ?? null : null,
        assignee_department: row.assigned_to ? assigneeMap[row.assigned_to]?.department ?? null : null,
      }));

      const projectIds = [...new Set(mapped.map((t) => t.project_id).filter(Boolean))] as string[];
      const clientIds = [...new Set(mapped.flatMap((t) => t.client_ids ?? []))];
      let projectLabelMap: Record<string, string> = {};
      let clientLabelMap: Record<string, string> = {};
      if (projectIds.length) {
        const { data: projects } = await supabase
          .from("projects")
          .select("id,project_name,project_code")
          .in("id", projectIds);
        projectLabelMap = Object.fromEntries(
          (projects ?? []).map((p: { id: string; project_name: string | null; project_code: string | null }) => [
            p.id,
            [p.project_code, p.project_name].filter(Boolean).join(" · ") || p.id.slice(0, 8),
          ]),
        );
      }
      if (clientIds.length) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id,name,lead_name,company_name")
          .in("id", clientIds);
        clientLabelMap = Object.fromEntries(
          (clients ?? []).map((c: { id: string; name: string | null; lead_name: string | null; company_name: string | null }) => [
            c.id,
            displayLeadName(c),
          ]),
        );
      }

      setRows(
        mapped.map((task) => ({
          ...task,
          project_label: task.project_id ? projectLabelMap[task.project_id] ?? null : null,
          linked_lead_labels: (task.client_ids ?? []).map((id) => clientLabelMap[id] ?? id.slice(0, 8)),
        })),
      );
    },
    [
      assignedFilter,
      dueDateFilter,
      filterTasksByAssigner,
      priorityFilter,
      searchDebounced,
      seesAllTasks,
      statusFilter,
      supabase,
    ],
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
        if (isMember) {
          const { data: me } = await supabase
            .from("profiles")
            .select("id,full_name,email,department,role")
            .eq("id", user.id)
            .maybeSingle();
          const profileRow = (me as ProfileOption | null) ?? null;
          setSelfProfile(profileRow);
          if (isEmployee) await loadAssignees();
        } else {
          setSelfProfile(null);
          await loadAssignees();
        }
        if (isAdmin || isEmployee) await loadProjectsForForm();
      } catch (bootstrapError) {
        setError(toReadableTaskError(bootstrapError));
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [isAdmin, isEmployee, isMember, isMentor, loadAssignees, loadProjectsForForm, supabase]);

  const projectPrefillDone = useRef(false);
  useEffect(() => {
    const pid = searchParams.get("project");
    if (!isAdmin || !pid || tasksTableMissing || !currentUserId || projectPrefillDone.current) return;
    projectPrefillDone.current = true;
    assigneeBeforeEditRef.current = null;
    setEditId(null);
    setForm({ ...initialForm, assignment_type: "project", project_id: pid });
    setPanelOpen(true);
  }, [currentUserId, isAdmin, searchParams, tasksTableMissing]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (departmentAssigner && selfProfile?.department && currentUserId) {
      void loadAssignees().catch((e) => setError(toReadableTaskError(e)));
    }
  }, [currentUserId, departmentAssigner, loadAssignees, selfProfile?.department]);

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

  const assigneeProfiles: AssigneeProfile[] = useMemo(
    () =>
      employees.map((e) => ({
        id: e.id,
        full_name: e.full_name,
        email: e.email,
        department: e.department ?? null,
        role: e.role ?? null,
      })),
    [employees],
  );

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

  /** Assign-task dropdown: employees cannot assign to themselves. */
  const assigneePickerOptions = useMemo(
    () => employeeOptions,
    [employeeOptions],
  );

  const employeeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((employee) => {
      map[employee.id] = employee.full_name || employee.email || "Unknown";
    });
    if (selfProfile?.id && !map[selfProfile.id]) {
      map[selfProfile.id] = selfProfile.full_name || selfProfile.email || "Unknown";
    }
    rows.forEach((task) => {
      if (task.assignee_name) {
        const key = task.assigned_to ?? `archived:${task.assignee_email ?? task.id}`;
        map[key] = task.assignee_name;
      }
    });
    return map;
  }, [employees, rows, selfProfile]);

  const overdueCount = useMemo(() => {
    const today = todayDateKey();
    return rows.filter((task) => task.due_date && task.due_date < today && task.status !== "Completed").length;
  }, [rows]);

  const dueTodayCount = useMemo(() => {
    const today = todayDateKey();
    return rows.filter((task) => task.due_date === today).length;
  }, [rows]);

  const {
    paginatedItems: paginatedRows,
    page: taskPage,
    setPage: setTaskPage,
    totalPages: taskTotalPages,
    totalItems: taskTotalItems,
    pageSize: taskPageSize,
    setPageSize: setTaskPageSize,
  } = usePagination(rows, 10);

  const taskSelection = useRowSelection(rows, (task) => task.id);

  useEffect(() => {
    taskSelection.clearSelection();
  }, [employeeTaskView, statusFilter, priorityFilter, assignedFilter, dueDateFilter, searchDebounced]);

  useEffect(() => {
    if (!isEmployee) return;
    setAssignedFilter("");
    setTaskPage(1);
  }, [employeeTaskView, isEmployee, setTaskPage]);

  const filtersActive = Boolean(
    searchText.trim() || statusFilter || priorityFilter || assignedFilter || dueDateFilter,
  );

  const clearTableFilters = () => {
    setSearchText("");
    setStatusFilter("");
    setPriorityFilter("");
    setAssignedFilter("");
    setDueDateFilter("");
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
    if (tasksTableMissing || isStudent) return;
    setError(null);
    setSuccess(null);
    assigneeBeforeEditRef.current = null;
    setEditId(null);
    try {
      await loadAssignees();
    } catch (assigneeLoadError) {
      setError(toReadableTaskError(assigneeLoadError));
    }
    setForm(initialForm);
    setPendingAttachmentFiles([]);
    setExistingAttachments([]);
    setSelectedClientIds([]);
    setSelectedLeadLabels([]);
    setLeadSelectionPath("");
    if (isEmployee) {
      if (!currentUserId) return;
      setForm({ ...initialForm, assigned_to: currentUserId });
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
      assigned_to: task.assigned_to ?? "",
      assignment_type: task.assignment_type ?? "",
      project_id: task.project_id ?? "",
      priority: task.priority,
      status: task.status,
      start_date: task.start_date ?? "",
      due_date: task.due_date ?? "",
      progress: task.progress,
    });
    setSelectedClientIds(task.client_ids ?? []);
    setSelectedLeadLabels(task.linked_lead_labels ?? []);
    setLeadSelectionPath(
      task.assignment_type === "lead" && task.linked_lead_labels?.length
        ? `Task Assignment → Assignee → Leads → ${task.linked_lead_labels.length} selected`
        : "",
    );
    setPendingAttachmentFiles([]);
    setExistingAttachments(task.attachment_urls ?? []);
    setPanelOpen(true);
  };

  useEffect(() => {
    const selection = consumeTaskLeadSelection();
    const draft = consumeTaskAssignDraft();
    if (draft) {
      setForm({
        title: draft.title,
        description: draft.description,
        assigned_to: draft.assigned_to,
        assignment_type: (draft.assignment_type as TaskFormValue["assignment_type"]) || "",
        project_id: draft.project_id,
        priority: draft.priority as TaskPriority,
        status: draft.status as TaskStatus,
        start_date: draft.start_date,
        due_date: draft.due_date,
        progress: draft.progress,
      });
      setPanelOpen(true);
    }
    if (selection) {
      setSelectedClientIds(selection.ids);
      setSelectedLeadLabels(selection.labels);
      setLeadSelectionPath(selection.filterPath);
      setForm((prev) => ({ ...prev, assignment_type: "lead" }));
      setPanelOpen(true);
    }
  }, []);

  const handleOpenLeadPicker = () => {
    saveTaskAssignDraft({
      title: form.title,
      description: form.description,
      assigned_to: form.assigned_to,
      assignment_type: form.assignment_type,
      project_id: form.project_id,
      priority: form.priority,
      status: form.status,
      start_date: form.start_date,
      due_date: form.due_date,
      progress: form.progress,
    });
    const returnTo = encodeURIComponent(pathname);
    if (isAdmin) {
      router.push(`/admin/student-master?pickForTask=1&returnTo=${returnTo}`);
      return;
    }
    if (isEmployee) {
      router.push(`/employee/student-master?pickForTask=1&returnTo=${returnTo}`);
      return;
    }
    setError("Lead selection is available from Student Master.");
  };

  const validateAssignmentLink = (): string | null => {
    if (!form.assignment_type) return "Choose whether this task is linked to Leads or a Project.";
    if (form.assignment_type === "lead" && !selectedClientIds.length) {
      return "Select at least one lead from Student Master (or Lead Management).";
    }
    if (form.assignment_type === "project" && !form.project_id.trim()) {
      return "Select a project for this task.";
    }
    return null;
  };

  const buildLinkPayload = () => {
    if (form.assignment_type === "project") {
      return {
        assignment_type: "project" as const,
        project_id: form.project_id.trim() || null,
        client_ids: [] as string[],
      };
    }
    if (form.assignment_type === "lead") {
      return {
        assignment_type: "lead" as const,
        project_id: null as string | null,
        client_ids: selectedClientIds,
      };
    }
    return {
      assignment_type: null as null,
      project_id: null as string | null,
      client_ids: [] as string[],
    };
  };

  const handleSaveTask = async () => {
    if (tasksTableMissing || isStudent) return;
    if (isEmployee) {
      if (editId) {
        setError("Use the task list to update status and progress. Ask an admin to change title, dates, or assignee.");
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
      const linkError = validateAssignmentLink();
      if (linkError) {
        setError(linkError);
        return;
      }
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const linkPayload = buildLinkPayload();
      const employeePayload = {
        title: form.title.trim(),
        description: form.description || null,
        assigned_to: form.assigned_to.trim(),
        assigned_by: currentUserId,
        ...linkPayload,
        priority: form.priority,
        status: form.status,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        progress: form.progress,
      };
      try {
        const { data: inserted, error: insertError } = await supabase
          .from("tasks")
          .insert(employeePayload)
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        if (inserted?.id && pendingAttachmentFiles.length) {
          const merged = await uploadTaskAttachments(supabase, currentUserId, inserted.id, pendingAttachmentFiles);
          await supabase.from("tasks").update({ attachment_urls: merged }).eq("id", inserted.id);
        }
        if (inserted?.id) {
          await logTaskActivity(supabase, {
            taskId: inserted.id,
            actorId: currentUserId,
            activityType: "task_created",
            notes: `Task assigned with ${linkPayload.assignment_type === "lead" ? `${selectedClientIds.length} lead(s)` : "project link"}.`,
            metadata: { assignment_type: linkPayload.assignment_type, client_ids: linkPayload.client_ids, project_id: linkPayload.project_id },
          });
        }
        setSuccess("Task assigned.");
        setPanelOpen(false);
        setForm(initialForm);
        setSelectedClientIds([]);
        setSelectedLeadLabels([]);
        setLeadSelectionPath("");
        setPendingAttachmentFiles([]);
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
    const linkError = validateAssignmentLink();
    if (linkError) {
      setError(linkError);
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const linkPayload = buildLinkPayload();
    const basePayload = {
      title: form.title.trim(),
      description: form.description || null,
      assigned_to: form.assigned_to,
      ...linkPayload,
      priority: form.priority,
      status: form.status,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      progress: form.progress,
    };
    try {
      const mergeAttachments = async (taskId: string, current: TaskAttachment[]) => {
        if (!pendingAttachmentFiles.length) return current;
        const uploaded = await uploadTaskAttachments(supabase, currentUserId, taskId, pendingAttachmentFiles);
        return [...current, ...uploaded];
      };

      if (editId) {
        const priorAssignee = assigneeBeforeEditRef.current;
        const savedTaskId = editId;
        const merged = await mergeAttachments(editId, existingAttachments);
        const updatePayload: typeof basePayload & {
          assigned_by?: string;
          attachment_urls?: TaskAttachment[];
        } = { ...basePayload, attachment_urls: merged };
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
        setSelectedClientIds([]);
        setSelectedLeadLabels([]);
        setLeadSelectionPath("");
        setPendingAttachmentFiles([]);
        await reload();
        if (priorAssignee !== basePayload.assigned_to) {
          void notifyAssigneeInApp(savedTaskId);
        }
        await logTaskActivity(supabase, {
          taskId: savedTaskId,
          actorId: currentUserId,
          activityType: "task_updated",
          notes: "Task details or assignment link updated.",
        });
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("tasks")
          .insert({ ...basePayload, assigned_by: currentUserId, attachment_urls: [] })
          .select("id")
          .single();
        if (insertError) throw new Error(insertError.message);
        if (inserted?.id && pendingAttachmentFiles.length) {
          const merged = await mergeAttachments(inserted.id, []);
          await supabase.from("tasks").update({ attachment_urls: merged }).eq("id", inserted.id);
        }
        if (inserted?.id) {
          await logTaskActivity(supabase, {
            taskId: inserted.id,
            actorId: currentUserId,
            activityType: "task_created",
            notes: `Task assigned with ${linkPayload.assignment_type === "lead" ? `${selectedClientIds.length} lead(s)` : "project link"}.`,
            metadata: { assignment_type: linkPayload.assignment_type, client_ids: linkPayload.client_ids, project_id: linkPayload.project_id },
          });
        }
        setSuccess("Task assigned successfully.");
        setPanelOpen(false);
        setForm(initialForm);
        setEditId(null);
        setSelectedClientIds([]);
        setSelectedLeadLabels([]);
        setLeadSelectionPath("");
        setPendingAttachmentFiles([]);
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

  const handleBulkDeleteTasks = async () => {
    if (!canManageTasks || tasksTableMissing || taskSelection.selectedCount === 0) return;
    const confirmed = window.confirm(`Delete ${taskSelection.selectedCount} selected task(s)?`);
    if (!confirmed) return;
    const ids = [...taskSelection.selected];
    const { error: deleteError } = await supabase.from("tasks").delete().in("id", ids);
    if (deleteError) {
      setError(toReadableTaskError(deleteError));
      return;
    }
    taskSelection.clearSelection();
    setSuccess(`${ids.length} task(s) deleted.`);
    await reload();
  };

  const persistEmployeeTaskUpdate = useCallback(
    async (taskId: string, status: TaskStatus, progress: number, prior?: TaskRecord) => {
      if (tasksTableMissing) return;
      const { error: updateError } = await supabase.from("tasks").update({ status, progress }).eq("id", taskId);
      if (updateError) {
        setError(toReadableTaskError(updateError));
        return;
      }
      if (currentUserId) {
        const notes: string[] = [];
        if (prior && prior.status !== status) notes.push(`Status → ${status}`);
        if (prior && prior.progress !== progress) notes.push(`Progress → ${progress}%`);
        await logTaskActivity(supabase, {
          taskId,
          actorId: currentUserId,
          activityType: "progress_update",
          notes: notes.join(" · ") || "Task updated.",
          metadata: { status, progress },
        });
      }
      setSuccess("Task updated.");
      await refreshTaskData(currentUserId);
    },
    [currentUserId, refreshTaskData, supabase, tasksTableMissing],
  );

  const handleEmployeeStatusChange = async (taskId: string, status: TaskStatus, progress: number) => {
    const prior = rows.find((t) => t.id === taskId);
    setRows((prev) => prev.map((task) => (task.id === taskId ? { ...task, status } : task)));
    await persistEmployeeTaskUpdate(taskId, status, progress, prior);
  };

  const handleEmployeeProgressAdjust = (taskId: string, status: TaskStatus, progress: number) => {
    setRows((prev) => prev.map((task) => (task.id === taskId ? { ...task, progress } : task)));
    if (progressDebounceRef.current[taskId]) clearTimeout(progressDebounceRef.current[taskId]);
    progressDebounceRef.current[taskId] = setTimeout(() => {
      const prior = rows.find((t) => t.id === taskId);
      void persistEmployeeTaskUpdate(taskId, status, progress, prior);
      delete progressDebounceRef.current[taskId];
    }, 450);
  };

  const handleCompleteTaskSubmit = async (summary: string, completionFiles: File[]) => {
    if (!completeTask || !currentUserId) return;
    setCompleteSubmitting(true);
    setError(null);
    try {
      let completionAttachments: TaskAttachment[] = [];
      if (completionFiles.length) {
        completionAttachments = await uploadTaskAttachments(
          supabase,
          currentUserId,
          completeTask.id,
          completionFiles,
        );
      }

      const { error: updateError } = await supabase
        .from("tasks")
        .update({
          status: "Completed",
          progress: 100,
          completion_summary: summary.trim(),
          completion_attachment_urls: completionAttachments,
        })
        .eq("id", completeTask.id)
        .eq("assigned_to", currentUserId);

      if (updateError) throw new Error(updateError.message);

      await logTaskActivity(supabase, {
        taskId: completeTask.id,
        actorId: currentUserId,
        activityType: "task_completed",
        notes: summary.trim(),
        metadata: { completion_files: completionAttachments.length },
      });

      const { error: rpcError } = await supabase.rpc("create_task_completed_notification", {
        p_task_id: completeTask.id,
      });
      if (rpcError) console.warn("create_task_completed_notification:", rpcError.message);

      setCompleteTask(null);
      setSuccess("Task completed. Summary and files were sent to your assigner.");
      await reload();
    } catch (e) {
      setError(toReadableTaskError(e));
    } finally {
      setCompleteSubmitting(false);
    }
  };

  return (
    <section className={`space-y-6 rounded-[24px] border bg-white p-4 sm:p-6 lg:p-8 ${isEmployee ? "border-[#d4deea] shadow-[0_20px_40px_rgba(30,64,175,0.08)]" : "border-[#e8dcc8] shadow-[0_20px_40px_rgba(30,64,175,0.08)]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">
            {isEmployee || (isPortalAssignee && !isEmployee) ? "My Tasks" : "Task Assignment"}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {isStudent
              ? "Work assigned to you by admins, mentors, or freelancers. Update progress and mark tasks complete — you cannot assign tasks to others."
              : isPortalAssignee && !isEmployee
                ? "Work assigned to you by admins. Update progress and mark tasks complete."
              : isEmployee
              ? employeeDelegatedView
                ? "Track tasks you delegated to teammates. Switch tabs to see work assigned to you."
                : "Work assigned to you and tasks you delegate to teammates. Update your own task progress or assign new work."
              : departmentAssigner
                ? `Assign work to students in your department (${selfProfile?.department ?? "set department in User Master"}). Only matching students appear in the assignee list.`
                : "Assign, track and manage tasks for students, freelancers, and mentors"}
          </p>
        </div>
        {canManageTasks || isEmployee ? (
          <Button
            data-requires-online
            onClick={() => void openCreate()}
            disabled={tasksTableMissing || (departmentAssigner && !selfProfile?.department)}
            className={`h-9 rounded-full px-4 text-white disabled:opacity-50 ${isEmployee ? "bg-[#2563eb] hover:bg-[#1d4ed8]" : "bg-[#c9a227] hover:bg-[#b8921f]"}`}
          >
            + Assign task
          </Button>
        ) : null}
      </div>

      {tasksTableMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#faf3e3] px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">Database setup required</p>
          <p className="mt-1 text-blue-800/90">
            The <code className="rounded bg-white/80 px-1">public.tasks</code> table is not available in this Supabase project. Open the SQL
            Editor for the project linked to this app (same URL as <code className="rounded bg-white/80 px-1">NEXT_PUBLIC_SUPABASE_URL</code>),
            run the script <strong>AJ_Academy_SB/task_schema.sql</strong>, then refresh. See <strong>DATABASE_SETUP_ORDER.txt</strong> for full
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

      <TableSearchBar
        value={searchText}
        onChange={setSearchText}
        placeholder="Search task title…"
        showClear={filtersActive}
        onClear={clearTableFilters}
        hint={`Showing ${paginatedRows.length} of ${rows.length} task(s)`}
      />

      {isEmployee ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEmployeeTaskView("assigned-to-me")}
              className={
                employeeTaskView === "assigned-to-me"
                  ? "rounded-full bg-[#1e3a8a] px-4 py-2 text-sm font-semibold text-white shadow-sm"
                  : "rounded-full border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[#1e3a8a] hover:bg-[#f8fafc]"
              }
            >
              Assigned to me
            </button>
            <button
              type="button"
              onClick={() => setEmployeeTaskView("assigned-by-me")}
              className={
                employeeTaskView === "assigned-by-me"
                  ? "rounded-full bg-[#1e3a8a] px-4 py-2 text-sm font-semibold text-white shadow-sm"
                  : "rounded-full border border-[#cbd5e1] bg-white px-4 py-2 text-sm font-semibold text-[#1e3a8a] hover:bg-[#f8fafc]"
              }
            >
              Tasks I assigned
            </button>
          </div>
          <p className="text-sm text-[#64748b]">
            {employeeDelegatedView
              ? `Work you delegated to teammates — track their status and progress (read-only). (${rows.length} assigned)`
              : `Work assigned to you — update status, progress, and mark completion when you finish. (${rows.length} tasks)`}
          </p>
        </div>
      ) : null}

      {canManageTasks && taskSelection.selectedCount > 0 ? (
        <BulkSelectionBar selectedCount={taskSelection.selectedCount} totalCount={rows.length} onClear={taskSelection.clearSelection}>
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-lg bg-rose-600 px-3 text-xs text-white hover:bg-rose-700"
            onClick={() => void handleBulkDeleteTasks()}
          >
            Delete selected
          </Button>
        </BulkSelectionBar>
      ) : null}

      <div className="responsive-table-wrap">
        <TaskTable
          tasks={paginatedRows}
          loading={loading}
          tableMissing={tasksTableMissing}
          employeeNameMap={employeeNameMap}
          canManageTasks={canManageTasks}
          assigneeColumn={
            isEmployee
              ? employeeDelegatedView
                ? "assigned-to"
                : "assigned-by"
              : isPortalAssignee
                ? "assigned-by"
                : "assigned-to"
          }
          showDepartment={isEmployee}
          readOnlyList={employeeDelegatedView}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          assignedFilter={assignedFilter}
          setAssignedFilter={setAssignedFilter}
          dueDateFilter={dueDateFilter}
          setDueDateFilter={setDueDateFilter}
          employeeOptions={employeeOptions}
          assigneeFilterDisabled={
            tasksTableMissing ||
            (isEmployee ? !employeeDelegatedView : !seesAllTasks && !mentorManagesTeam)
          }
          filtersDisabled={tasksTableMissing}
          onView={(task) => setViewTask(task)}
          onEdit={(task) => void openEdit(task)}
          onDelete={(taskId) => void handleDeleteTask(taskId)}
          onEmployeeStatusChange={(taskId, status, progress) => void handleEmployeeStatusChange(taskId, status, progress)}
          onEmployeeProgressChange={(taskId, status, progress) => handleEmployeeProgressAdjust(taskId, status, progress)}
          onRequestCompleteTask={
            !canManageTasks && !employeeDelegatedView ? (task) => setCompleteTask(task) : undefined
          }
          pagination={{
            page: taskPage,
            totalPages: taskTotalPages,
            totalItems: taskTotalItems,
            pageSize: taskPageSize,
            onPageChange: setTaskPage,
            onPageSizeChange: setTaskPageSize,
          }}
          selection={
            canManageTasks
              ? {
                  allSelected: taskSelection.allSelected,
                  someSelected: taskSelection.someSelected,
                  isSelected: taskSelection.isSelected,
                  onToggleAll: taskSelection.toggleAll,
                  onToggle: taskSelection.toggleOne,
                }
              : undefined
          }
        />
      </div>

      <TaskCompleteDialog
        task={completeTask}
        submitting={completeSubmitting}
        onClose={() => !completeSubmitting && setCompleteTask(null)}
        onSubmit={handleCompleteTaskSubmit}
      />

      {viewTask ? (
        <TaskViewPanel task={viewTask} employeeNameMap={employeeNameMap} supabase={supabase} onClose={() => setViewTask(null)} />
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
                className="touch-target flex items-center justify-center rounded-full border border-[#e8dcc8] bg-white p-2 text-[#3d3428] shadow-sm transition hover:bg-[#faf3e3] active:scale-95"
              >
                <span className="flex h-5 w-5 items-center justify-center text-lg font-semibold leading-none">×</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <TaskForm
                open={panelOpen}
                title={editId ? "Edit Task" : "Assign task"}
                value={form}
                assigneeProfiles={assigneeProfiles}
                projects={projectOptions}
                showAssignmentFields={isAdmin || isEmployee}
                selectedLeadCount={selectedClientIds.length}
                selectedLeadPreview={
                  selectedLeadLabels.length
                    ? selectedLeadLabels.length <= 2
                      ? selectedLeadLabels.join(", ")
                      : `${selectedLeadLabels.slice(0, 2).join(", ")} +${selectedLeadLabels.length - 2} more`
                    : ""
                }
                leadSelectionPath={leadSelectionPath}
                onOpenLeadPicker={handleOpenLeadPicker}
                leadPickerLabel="Open Student Master to select leads"
                assigneeLockedToSelf={false}
                assigneeHelperText={
                  isEmployee
                    ? "Pick category → department → person. Employees show name and department."
                    : departmentAssigner
                    ? "Only active students in your department are listed."
                    : "Pick Student, Freelancer, Mentor, or Employee — then department and person."
                }
                submitting={submitting}
                onChange={(next) => {
                  if (next.assigned_to !== form.assigned_to) {
                    setSelectedClientIds([]);
                    setSelectedLeadLabels([]);
                    setLeadSelectionPath("");
                  }
                  setForm(next);
                }}
                onClose={() => setPanelOpen(false)}
                onSubmit={() => void handleSaveTask()}
              />
              {(isAdmin || isEmployee || canManageTasks) ? (
                <div className="mt-4">
                  <TaskAttachmentUpload
                    files={pendingAttachmentFiles}
                    onFilesChange={setPendingAttachmentFiles}
                    existing={existingAttachments}
                    disabled={submitting}
                  />
                </div>
              ) : null}
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
  supabase,
  onClose,
}: {
  task: TaskRecord;
  employeeNameMap: Record<string, string>;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
}) {
  const [activities, setActivities] = useState<TaskActivityRow[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setActivitiesLoading(true);
      try {
        const rows = await fetchTaskActivities(supabase, task.id);
        if (!cancelled) setActivities(rows);
      } catch {
        if (!cancelled) setActivities([]);
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase, task.id]);

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={onClose} />
      <div className="fixed inset-y-6 right-4 z-[61] mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-[24px] border border-[#e8dcc8] bg-white shadow-2xl sm:right-10">
        <div className="flex items-start justify-between border-b border-[#e8edf5] px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a]">{task.title}</h3>
            <p className="mt-1 text-xs text-[#64748b]">
              Assigned to{" "}
              {(task.assigned_to && employeeNameMap[task.assigned_to]) || task.assignee_name || "—"}
            </p>
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
            <div className="col-span-2">
              <dt className="text-[#94a3b8]">Linked to</dt>
              <dd className="mt-1 font-medium">
                {task.assignment_type === "project" && task.project_label ? (
                  <span>Project · {task.project_label}</span>
                ) : task.assignment_type === "lead" && task.linked_lead_labels?.length ? (
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {task.linked_lead_labels.map((label) => (
                      <li key={label}>{label}</li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          {task.completion_attachment_urls?.length ? (
            <div>
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Completion files</p>
              <ul className="mt-2 space-y-1">
                {task.completion_attachment_urls.map((a) => (
                  <li key={a.url}>
                    <a
                      href={a.url}
                      download={a.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-emerald-700 underline"
                    >
                      Download {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {task.attachment_urls?.length ? (
            <div>
              <p className="text-xs font-semibold uppercase text-[#94a3b8]">Attachments</p>
              <ul className="mt-2 space-y-1">
                {task.attachment_urls.map((a) => (
                  <li key={a.url}>
                    <a
                      href={a.url}
                      download={a.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-[#a68b2e] underline"
                    >
                      Download {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-semibold uppercase text-[#94a3b8]">Activity & progress</p>
            {activitiesLoading ? (
              <p className="mt-2 text-xs text-[#64748b]">Loading activity…</p>
            ) : activities.length ? (
              <ul className="mt-2 space-y-2">
                {activities.map((a) => (
                  <li key={a.id} className="rounded-lg border border-[#e8edf5] bg-[#f8fbff] px-3 py-2 text-xs">
                    <p className="font-medium text-[#0f172a]">
                      {a.activity_type.replace(/_/g, " ")}
                      {a.actor_name ? ` · ${a.actor_name}` : ""}
                    </p>
                    {a.notes ? <p className="mt-1 text-[#475569]">{a.notes}</p> : null}
                    <p className="mt-1 text-[#94a3b8]">{new Date(a.created_at).toLocaleString("en-IN")}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[#64748b]">No activity logged yet.</p>
            )}
          </div>
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
