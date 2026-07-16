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
import { TaskViewPanel } from "@/components/task/TaskViewPanel";
import type { AssigneeProfile } from "@/components/task/TaskAssigneePicker";
import { usePagination } from "@/lib/usePagination";
import { useRowSelection } from "@/lib/useRowSelection";
import { assignerDisplayFromProfile } from "@/lib/profileDisplayName";
import { parseTaskAttachments, uploadTaskAttachments, type TaskAttachment } from "@/lib/taskAttachments";
import { fetchTaskActivities, logTaskActivity, parseClientIds, type TaskActivityRow } from "@/lib/taskActivities";
import { mapClientRowToTaskLinkedLead } from "@/lib/taskLeadOutreach";
import { TaskLeadOutreachBlock } from "@/components/task/TaskLeadOutreachBlock";
import {
  flattenTaskColleges,
  flattenTaskLeads,
  TaskSubsectionCollegesTable,
  TaskSubsectionLeadsTable,
} from "@/components/task/TaskSubsectionEntityTables";
import { displayLeadName, STUDENT_LEAD_SELECT, STUDENT_LEAD_SELECT_NO_PROPOSAL_FILES, isMissingStudentProposalFileColumn, type CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";
import { StudentLeadFormPanel, type StudentLeadFormValue } from "@/components/student-lead-master/StudentLeadFormPanel";
import {
  buildEmployeeLeadUpdatePayload,
  crmClientRowToStudentForm,
  emptyStudentLeadForm,
} from "@/components/student-lead-master/studentLeadFormMap";
import { LeadActivityModal, type LeadActivityItem } from "@/components/shared/LeadActivityModal";
import { CollegeVisitFormPanel } from "@/components/college-visits/CollegeVisitFormPanel";
import {
  COLLEGE_VISIT_SELECT,
  collegeVisitRowToForm,
  emptyCollegeVisitForm,
  nextCollegeVisitSelect,
  type CollegeVisitFormValue,
  type CollegeVisitRow,
} from "@/components/college-visits/collegeVisitsHelpers";
import { fetchInterestedPrograms } from "@/lib/studentPrograms";
import {
  consumeTaskAssignDraft,
  consumeTaskCollegeSelection,
  consumeTaskLeadSelection,
  saveTaskAssignDraft,
} from "@/lib/taskLeadPickStorage";
import { formatDisplayDate } from "@/lib/datetime";
import type { TaskAssignmentType, TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

type AppRole = "admin" | "employee" | "student" | "freelancer" | "mentor";

/** assignee = tasks assigned to me; assigner = department-scoped task assignment (mentor / freelancer). */
export type TaskAssignmentVariant = "assignee" | "assigner";

type EmployeeTaskView = "assigned-to-me" | "assigned-by-me";
type LinkTypeFilter = TaskAssignmentType | "all";

const LINK_TYPE_TABS: { id: LinkTypeFilter; label: string }[] = [
  { id: "all", label: "All types" },
  { id: "lead", label: "Student Lead" },
  { id: "college", label: "College Visit" },
  { id: "project", label: "Project" },
];

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

function taskLinkActivityNote(
  assignmentType: TaskAssignmentType | null | undefined,
  leadCount: number,
  collegeCount: number,
) {
  if (assignmentType === "lead") return `${leadCount} lead(s)`;
  if (assignmentType === "college") return `${collegeCount} college(s)`;
  if (assignmentType === "project") return "project link";
  return "no link";
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
        m.includes("college_visit_ids") ||
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
    raw.toLowerCase().includes("college_visit_ids") ||
    raw.toLowerCase().includes("assignment_type")
  ) {
    return "DATABASE_SETUP: Re-run `AJ_Academy_SB/tasks_assignment_link_patch.sql`, `AJ_Academy_SB/tasks_college_link_patch.sql`, `AJ_Academy_SB/tasks_employee_rls_fix.sql`, and `AJ_Academy_SB/tasks_linked_lead_access.sql` in Supabase, then refresh.";
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
  const [linkTypeFilter, setLinkTypeFilter] = useState<LinkTypeFilter>("all");
  const employeeDelegatedView = isEmployee && employeeTaskView === "assigned-by-me";
  const showLinkTypeTabs = isEmployee || isAdmin;
  const filterTasksByAssigner = mentorManagesTeam || employeeDelegatedView;
  const [currentUserId, setCurrentUserId] = useState("");
  const [selfProfile, setSelfProfile] = useState<ProfileOption | null>(null);
  const [employees, setEmployees] = useState<ProfileOption[]>([]);
  const [rows, setRows] = useState<TaskRecord[]>([]);
  const [linkedLeadById, setLinkedLeadById] = useState<Record<string, CrmClientRow>>({});
  const [linkedCollegeById, setLinkedCollegeById] = useState<Record<string, CollegeVisitRow>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [tasksTableMissing, setTasksTableMissing] = useState(false);
  const [summary, setSummary] = useState({ total: 0, pending: 0, inProgress: 0, completed: 0 });
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormValue>(initialForm);
  const [viewTask, setViewTask] = useState<TaskRecord | null>(null);
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  const [editLeadForm, setEditLeadForm] = useState<StudentLeadFormValue>(() => emptyStudentLeadForm());
  const [editLeadSubmitting, setEditLeadSubmitting] = useState(false);
  const [programOptions, setProgramOptions] = useState<string[]>([]);
  const [activityLead, setActivityLead] = useState<CrmClientRow | null>(null);
  const [activityLeadRows, setActivityLeadRows] = useState<LeadActivityItem[]>([]);
  const [activityLeadLoading, setActivityLeadLoading] = useState(false);
  const [editCollegeId, setEditCollegeId] = useState<string | null>(null);
  const [editCollegeForm, setEditCollegeForm] = useState<CollegeVisitFormValue>(() => emptyCollegeVisitForm());
  const [editCollegeSubmitting, setEditCollegeSubmitting] = useState(false);
  const [activityCollege, setActivityCollege] = useState<CollegeVisitRow | null>(null);
  const [activityCollegeRows, setActivityCollegeRows] = useState<LeadActivityItem[]>([]);
  const [activityCollegeLoading, setActivityCollegeLoading] = useState(false);
  const [completeTask, setCompleteTask] = useState<TaskRecord | null>(null);
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [projectOptions, setProjectOptions] = useState<{ id: string; label: string }[]>([]);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<TaskAttachment[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [selectedLeadLabels, setSelectedLeadLabels] = useState<string[]>([]);
  const [leadSelectionPath, setLeadSelectionPath] = useState("");
  const [selectedCollegeVisitIds, setSelectedCollegeVisitIds] = useState<string[]>([]);
  const [selectedCollegeLabels, setSelectedCollegeLabels] = useState<string[]>([]);
  const [collegeSelectionPath, setCollegeSelectionPath] = useState("");

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
        label: [row.project_code, row.project_name].filter(Boolean).join(" Â· ") || row.id.slice(0, 8),
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
          "id,title,description,assigned_to,assignee_name,assignee_email,assigned_by,completion_summary,completion_attachment_urls,priority,status,start_date,due_date,progress,assignment_type,project_id,client_ids,college_visit_ids,attachment_urls,created_at,updated_at",
        );

      if (filterTasksByAssigner) query = query.eq("assigned_by", userId);
      else if (!seesAllTasks) query = query.eq("assigned_to", userId);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (priorityFilter) query = query.eq("priority", priorityFilter);
      if (assignedFilter) query = query.eq("assigned_to", assignedFilter);
      if (dueDateFilter) query = query.eq("due_date", dueDateFilter);
      if (searchDebounced) query = query.ilike("title", `%${searchDebounced}%`);

      query = query.order("due_date", { ascending: true, nullsFirst: false }).limit(250);

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
        assignment_type?: "lead" | "project" | "college" | null;
        project_id?: string | null;
        client_ids?: unknown;
        college_visit_ids?: unknown;
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
        college_visit_ids: parseClientIds(row.college_visit_ids),
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
      const collegeIds = [...new Set(mapped.flatMap((t) => t.college_visit_ids ?? []))];
      let projectLabelMap: Record<string, string> = {};
      let clientLabelMap: Record<string, string> = {};
      let collegeLabelMap: Record<string, string> = {};
      let clientDetailMap: Record<string, ReturnType<typeof mapClientRowToTaskLinkedLead>> = {};
      if (projectIds.length) {
        const { data: projects } = await supabase
          .from("projects")
          .select("id,project_name,project_code")
          .in("id", projectIds);
        projectLabelMap = Object.fromEntries(
          (projects ?? []).map((p: { id: string; project_name: string | null; project_code: string | null }) => [
            p.id,
            [p.project_code, p.project_name].filter(Boolean).join(" Â· ") || p.id.slice(0, 8),
          ]),
        );
      }
      if (clientIds.length || collegeIds.length) {
        try {
          const linkedRes = await fetch("/api/tasks/linked-crm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientIds, collegeIds }),
          });
          if (linkedRes.ok) {
            const linkedJson = (await linkedRes.json()) as {
              clients?: CrmClientRow[];
              colleges?: CollegeVisitRow[];
            };
            if (clientIds.length) {
              const detailMap: Record<string, ReturnType<typeof mapClientRowToTaskLinkedLead>> = {};
              const fullMap: Record<string, CrmClientRow> = {};
              for (const row of linkedJson.clients ?? []) {
                fullMap[row.id] = row;
                detailMap[row.id] = mapClientRowToTaskLinkedLead(row);
                clientLabelMap[row.id] = detailMap[row.id].name;
              }
              clientDetailMap = detailMap;
              setLinkedLeadById(fullMap);
            } else {
              setLinkedLeadById({});
            }
            if (collegeIds.length) {
              const fullMap: Record<string, CollegeVisitRow> = {};
              collegeLabelMap = Object.fromEntries(
                (linkedJson.colleges ?? []).map((row) => {
                  fullMap[row.id] = row;
                  return [
                    row.id,
                    [row.college_name, row.location].filter(Boolean).join(" Â· ") || row.id.slice(0, 8),
                  ];
                }),
              );
              setLinkedCollegeById(fullMap);
            } else {
              setLinkedCollegeById({});
            }
          } else {
            console.warn("My Tasks: linked-crm API", await linkedRes.text());
          }
        } catch (e) {
          console.warn("My Tasks: linked-crm fetch failed", e);
        }
      }

      // Fallbacks if API returned nothing / unavailable (RPC + direct select)
      const missingClientIds = clientIds.filter((id) => !clientDetailMap[id]);
      if (missingClientIds.length) {
        let clients: unknown[] | null = null;
        let clientsErr: { message: string } | null = null;

        const rpc = await supabase.rpc("get_my_task_linked_clients", { p_ids: missingClientIds });
        if (!rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
          clients = rpc.data as unknown[];
        } else {
          let clientSelect = STUDENT_LEAD_SELECT;
          let res = await supabase.from("clients").select(clientSelect).in("id", missingClientIds);
          if (res.error && isMissingStudentProposalFileColumn(res.error.message)) {
            clientSelect = STUDENT_LEAD_SELECT_NO_PROPOSAL_FILES;
            res = await supabase.from("clients").select(clientSelect).in("id", missingClientIds);
          }
          clients = res.data;
          clientsErr = res.error;
          if (!clientsErr && !(clients ?? []).length) {
            const minimal = await supabase
              .from("clients")
              .select(
                "id,lead_name,name,phone,whatsapp,email,city,status,priority,assigned_to,phone_called,whatsapp_sent,email_sent",
              )
              .in("id", missingClientIds);
            if (!minimal.error && (minimal.data ?? []).length) {
              clients = minimal.data;
            }
          }
        }

        if (clientsErr) {
          console.warn("My Tasks: could not load linked student leads", clientsErr.message);
        }
        const detailMap = { ...clientDetailMap };
        const fullMap: Record<string, CrmClientRow> = {};
        for (const c of clients ?? []) {
          const row = c as unknown as CrmClientRow;
          fullMap[row.id] = row;
          detailMap[row.id] = mapClientRowToTaskLinkedLead(row);
          clientLabelMap[row.id] = detailMap[row.id].name;
        }
        clientDetailMap = detailMap;
        setLinkedLeadById((prev) => ({ ...prev, ...fullMap }));
        if (missingClientIds.some((id) => !detailMap[id])) {
          console.warn(
            "My Tasks: some linked leads still missing â€” re-run AJ_Academy_SB/tasks_linked_lead_access.sql and ensure SUPABASE_SERVICE_ROLE_KEY is set.",
          );
        }
      } else if (!clientIds.length) {
        setLinkedLeadById({});
      }

      if (collegeIds.length && !Object.keys(collegeLabelMap).length) {
        let collegeSelect = COLLEGE_VISIT_SELECT;
        let { data: colleges, error: collegesErr } = await supabase
          .from("college_visits")
          .select(collegeSelect)
          .in("id", collegeIds);
        while (collegesErr) {
          const fallback = nextCollegeVisitSelect(collegeSelect, collegesErr.message);
          if (!fallback) break;
          collegeSelect = fallback;
          ({ data: colleges, error: collegesErr } = await supabase
            .from("college_visits")
            .select(collegeSelect)
            .in("id", collegeIds));
        }
        if (collegesErr) {
          console.warn("My Tasks: could not load linked colleges", collegesErr.message);
        }
        const fullMap: Record<string, CollegeVisitRow> = {};
        collegeLabelMap = Object.fromEntries(
          (colleges ?? []).map((c) => {
            const row = c as unknown as CollegeVisitRow;
            fullMap[row.id] = row;
            return [row.id, [row.college_name, row.location].filter(Boolean).join(" Â· ") || row.id.slice(0, 8)];
          }),
        );
        setLinkedCollegeById(fullMap);
      } else if (!collegeIds.length) {
        setLinkedCollegeById({});
      }

      setRows(
        mapped.map((task) => ({
          ...task,
          project_label: task.project_id ? projectLabelMap[task.project_id] ?? null : null,
          linked_lead_labels: (task.client_ids ?? []).map((id) => clientLabelMap[id] ?? id.slice(0, 8)),
          linked_leads:
            task.assignment_type === "lead"
              ? (task.client_ids ?? []).map((id) => clientDetailMap[id]).filter(Boolean)
              : [],
          linked_college_labels: (task.college_visit_ids ?? []).map((id) => collegeLabelMap[id] ?? id.slice(0, 8)),
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
          // Defer heavy assignee/project lists until Assign is opened (employees).
          if (!isEmployee) await loadAssignees();
        } else {
          setSelfProfile(null);
          await loadAssignees();
        }
        if (isAdmin) await loadProjectsForForm();
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
    const section = (searchParams.get("section") || searchParams.get("type") || "").trim();
    if (section === "lead" || section === "college" || section === "project" || section === "all") {
      setLinkTypeFilter(section);
    }
  }, [searchParams]);

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
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("task-live-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void refreshTaskData(currentUserId);
        }, 800);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "clients" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void refreshTaskData(currentUserId);
        }, 800);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "college_visits" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          void refreshTaskData(currentUserId);
        }, 800);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
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
        const label = dept ? `${name} â€” ${dept}` : name;
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

  const filteredRows = useMemo(() => {
    if (linkTypeFilter === "all") return rows;
    return rows.filter((t) => (t.assignment_type ?? "") === linkTypeFilter);
  }, [linkTypeFilter, rows]);

  const subsectionLeadRows = useMemo(
    () => flattenTaskLeads(filteredRows, linkedLeadById),
    [filteredRows, linkedLeadById],
  );
  const subsectionCollegeRows = useMemo(
    () => flattenTaskColleges(filteredRows, linkedCollegeById),
    [filteredRows, linkedCollegeById],
  );

  const {
    paginatedItems: paginatedRows,
    page: taskPage,
    setPage: setTaskPage,
    totalPages: taskTotalPages,
    totalItems: taskTotalItems,
    pageSize: taskPageSize,
    setPageSize: setTaskPageSize,
  } = usePagination(filteredRows, 10);

  const taskSelection = useRowSelection(filteredRows, (task) => task.id);

  useEffect(() => {
    taskSelection.clearSelection();
  }, [employeeTaskView, linkTypeFilter, statusFilter, priorityFilter, assignedFilter, dueDateFilter, searchDebounced]);

  useEffect(() => {
    if (!isEmployee) return;
    setAssignedFilter("");
    setTaskPage(1);
  }, [employeeTaskView, isEmployee, setTaskPage]);

  useEffect(() => {
    setTaskPage(1);
  }, [linkTypeFilter, setTaskPage]);

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

  const openCreate = async (presetType?: LinkTypeFilter) => {
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
    const type =
      presetType && presetType !== "all"
        ? presetType
        : linkTypeFilter !== "all"
          ? linkTypeFilter
          : "";
    const base = {
      ...initialForm,
      assignment_type: (type || "") as TaskFormValue["assignment_type"],
      ...(isEmployee && currentUserId ? { assigned_to: currentUserId } : {}),
    };
    setForm(base);
    setPendingAttachmentFiles([]);
    setExistingAttachments([]);
    setSelectedClientIds([]);
    setSelectedLeadLabels([]);
    setLeadSelectionPath("");
    setSelectedCollegeVisitIds([]);
    if (isEmployee && !currentUserId) return;
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
        ? `Task Assignment â†’ Assignee â†’ Leads â†’ ${task.linked_lead_labels.length} selected`
        : "",
    );
    setSelectedCollegeVisitIds(task.college_visit_ids ?? []);
    setSelectedCollegeLabels(task.linked_college_labels ?? []);
    setCollegeSelectionPath(
      task.assignment_type === "college" && task.linked_college_labels?.length
        ? `Task Assignment â†’ Assignee â†’ Colleges â†’ ${task.linked_college_labels.length} selected`
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
      setSelectedCollegeVisitIds([]);
      setSelectedCollegeLabels([]);
      setCollegeSelectionPath("");
      setForm((prev) => ({ ...prev, assignment_type: "lead" }));
      setPanelOpen(true);
    }
    const collegeSelection = consumeTaskCollegeSelection();
    if (collegeSelection) {
      setSelectedCollegeVisitIds(collegeSelection.ids);
      setSelectedCollegeLabels(collegeSelection.labels);
      setCollegeSelectionPath(collegeSelection.filterPath);
      setSelectedClientIds([]);
      setSelectedLeadLabels([]);
      setLeadSelectionPath("");
      setForm((prev) => ({ ...prev, assignment_type: "college" }));
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

  const handleOpenCollegePicker = () => {
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
      router.push(`/admin/college-visits?pickForTask=1&returnTo=${returnTo}`);
      return;
    }
    if (isEmployee) {
      router.push(`/employee/college-visits?pickForTask=1&returnTo=${returnTo}`);
      return;
    }
    setError("College selection is available from College Visits.");
  };

  const validateAssignmentLink = (): string | null => {
    if (!form.assignment_type) return "Choose whether this task is linked to Leads, Colleges, or a Project.";
    if (form.assignment_type === "lead" && !selectedClientIds.length) {
      return "Select at least one lead from Student Master.";
    }
    if (form.assignment_type === "college" && !selectedCollegeVisitIds.length) {
      return "Select at least one college from College Visits.";
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
        college_visit_ids: [] as string[],
      };
    }
    if (form.assignment_type === "lead") {
      return {
        assignment_type: "lead" as const,
        project_id: null as string | null,
        client_ids: selectedClientIds,
        college_visit_ids: [] as string[],
      };
    }
    if (form.assignment_type === "college") {
      return {
        assignment_type: "college" as const,
        project_id: null as string | null,
        client_ids: [] as string[],
        college_visit_ids: selectedCollegeVisitIds,
      };
    }
    return {
      assignment_type: null as null,
      project_id: null as string | null,
      client_ids: [] as string[],
      college_visit_ids: [] as string[],
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
            notes: `Task assigned with ${taskLinkActivityNote(linkPayload.assignment_type, selectedClientIds.length, selectedCollegeVisitIds.length)}.`,
            metadata: {
              assignment_type: linkPayload.assignment_type,
              client_ids: linkPayload.client_ids,
              college_visit_ids: linkPayload.college_visit_ids,
              project_id: linkPayload.project_id,
            },
          });
        }
        setSuccess("Task assigned.");
        setPanelOpen(false);
        setForm(initialForm);
        setSelectedClientIds([]);
        setSelectedLeadLabels([]);
        setLeadSelectionPath("");
        setSelectedCollegeVisitIds([]);
        setSelectedCollegeLabels([]);
        setCollegeSelectionPath("");
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
        setSelectedCollegeVisitIds([]);
        setSelectedCollegeLabels([]);
        setCollegeSelectionPath("");
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
            notes: `Task assigned with ${taskLinkActivityNote(linkPayload.assignment_type, selectedClientIds.length, selectedCollegeVisitIds.length)}.`,
            metadata: {
              assignment_type: linkPayload.assignment_type,
              client_ids: linkPayload.client_ids,
              college_visit_ids: linkPayload.college_visit_ids,
              project_id: linkPayload.project_id,
            },
          });
        }
        setSuccess("Task assigned successfully.");
        setPanelOpen(false);
        setForm(initialForm);
        setEditId(null);
        setSelectedClientIds([]);
        setSelectedLeadLabels([]);
        setLeadSelectionPath("");
        setSelectedCollegeVisitIds([]);
        setSelectedCollegeLabels([]);
        setCollegeSelectionPath("");
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
    if (tasksTableMissing) return;
    const confirmed = window.confirm("Delete this task?");
    if (!confirmed) return;
    let q = supabase.from("tasks").delete().eq("id", taskId).select("id");
    if (!canManageTasks && currentUserId) {
      // Employees may delete tasks they create or that are assigned to them (RLS still applies).
      q = q.or(`assigned_to.eq.${currentUserId},assigned_by.eq.${currentUserId}`);
    }
    const { data: deletedRows, error: deleteError } = await q;
    if (deleteError) {
      setError(toReadableTaskError(deleteError));
      return;
    }
    if (!deletedRows?.length) {
      setError("Could not delete this task (permission denied or already removed).");
      return;
    }
    setSuccess("Task deleted successfully.");
    await reload();
  };

  const handleBulkDeleteTasks = async () => {
    if (tasksTableMissing || taskSelection.selectedCount === 0) return;
    const confirmed = window.confirm(`Delete ${taskSelection.selectedCount} selected task(s)?`);
    if (!confirmed) return;
    const ids = [...taskSelection.selected];
    let q = supabase.from("tasks").delete().in("id", ids).select("id");
    if (!canManageTasks && currentUserId) {
      q = q.or(`assigned_to.eq.${currentUserId},assigned_by.eq.${currentUserId}`);
    }
    const { data: deletedRows, error: deleteError } = await q;
    if (deleteError) {
      setError(toReadableTaskError(deleteError));
      return;
    }
    const n = deletedRows?.length ?? 0;
    if (n === 0) {
      setError("No tasks were deleted (permission denied).");
      return;
    }
    taskSelection.clearSelection();
    setSuccess(n === ids.length ? `${n} task(s) deleted.` : `${n} of ${ids.length} task(s) deleted.`);
    await reload();
  };

  const handleBulkPinSelected = async () => {
    if (taskSelection.selectedCount === 0) {
      setError("Select at least one task row, then click Pin selected.");
      return;
    }
    if (!currentUserId) {
      setError("Session not ready. Refresh the page and try pinning again.");
      return;
    }
    const ids = [...taskSelection.selected];
    const taskById = Object.fromEntries(rows.map((t) => [t.id, t]));
    const sectionFor = (taskId: string): string => {
      if (linkTypeFilter === "lead" || linkTypeFilter === "college" || linkTypeFilter === "project") {
        return linkTypeFilter;
      }
      const t = taskById[taskId]?.assignment_type;
      if (t === "lead" || t === "college" || t === "project") return t;
      return "all";
    };

    const leadIds = ids.filter((id) => sectionFor(id) === "lead");
    const collegeIds = ids.filter((id) => sectionFor(id) === "college");
    const projectIds = ids.filter((id) => sectionFor(id) === "project" || sectionFor(id) === "all");

    setPinBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const messages: string[] = [];

      const pinCrm = async (taskIds: string[], entityType: "lead" | "college") => {
        const res = await fetch("/api/tasks/crm-pins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskIds, entityType }),
        });
        const json = (await res.json()) as {
          pinned?: number;
          destination?: string;
          error?: string;
          warning?: string;
        };
        if (!res.ok) throw new Error(json.error || "Could not pin CRM records.");
        const n = json.pinned ?? 0;
        if (n <= 0) {
          throw new Error(
            entityType === "lead"
              ? "No linked student leads on the selected tasks."
              : "No linked colleges on the selected tasks.",
          );
        }
        messages.push(
          `${n} ${entityType === "lead" ? "student lead(s)" : "college(s)"} saved to ${json.destination ?? (entityType === "lead" ? "Student Master → All Students" : "College Visits")}.`,
        );
        if (json.warning) messages.push(json.warning);
      };

      if (leadIds.length) await pinCrm(leadIds, "lead");
      if (collegeIds.length) await pinCrm(collegeIds, "college");

      if (projectIds.length) {
        const { data: pinnedCount, error: rpcError } = await supabase.rpc("upsert_my_task_pins", {
          p_task_ids: projectIds,
          p_pin_section: "project",
        });
        if (rpcError && !/upsert_my_task_pins|function|schema cache|could not find/i.test(rpcError.message)) {
          throw new Error(
            /permission|denied|policy|rls/i.test(rpcError.message)
              ? "Pin blocked by database permissions. Run AJ_Academy_SB/employee_task_pins_section_patch.sql in Supabase."
              : toReadableTaskError(rpcError),
          );
        }
        if (rpcError) {
          const now = new Date().toISOString();
          const { error: pinError } = await supabase.from("employee_task_pins").upsert(
            projectIds.map((task_id) => ({
              user_id: currentUserId,
              task_id,
              pin_section: "project",
              pinned_at: now,
            })),
            { onConflict: "user_id,task_id" },
          );
          if (pinError) {
            throw new Error(
              /pin_section|schema|permission|denied|policy/i.test(pinError.message)
                ? "Run AJ_Academy_SB/employee_task_pins_section_patch.sql in Supabase, then try again."
                : toReadableTaskError(pinError),
            );
          }
          messages.push(`${projectIds.length} project task(s) pinned to Dashboard → My tasks.`);
        } else {
          const n = typeof pinnedCount === "number" ? pinnedCount : Number(pinnedCount) || projectIds.length;
          if (n <= 0) {
            throw new Error("Could not pin project tasks to the dashboard.");
          }
          messages.push(`${n} project task(s) pinned to Dashboard → My tasks.`);
        }
      }

      if (!messages.length) {
        setError("Select Student Lead, College Visit, or Project tasks to pin.");
        return;
      }

      taskSelection.clearSelection();
      setSuccess(messages.join(" "));
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(toReadableTaskError(e));
    } finally {
      setPinBusy(false);
    }
  };

  const openLeadEdit = (lead: CrmClientRow, leadLoaded: boolean) => {
    if (!leadLoaded) {
      setError("Lead details are not loaded yet. Refresh My Tasks and try View again.");
      return;
    }
    setViewTask(null);
    setEditCollegeId(null);
    setEditLeadId(lead.id);
    setEditLeadForm(crmClientRowToStudentForm(lead));
    void fetchInterestedPrograms(supabase).then(setProgramOptions).catch(() => setProgramOptions([]));
  };

  const openLeadActivity = async (lead: CrmClientRow) => {
    setActivityLead(lead);
    setActivityLeadLoading(true);
    setActivityLeadRows([]);
    const { data, error: actError } = await supabase
      .from("lead_activities")
      .select("id,client_id,activity_type,notes,old_value,new_value,created_at,created_by")
      .eq("client_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (actError) setError(actError.message);
    else setActivityLeadRows((data ?? []) as LeadActivityItem[]);
    setActivityLeadLoading(false);
  };

  const saveLeadEdit = async () => {
    if (!editLeadId || !currentUserId) return;
    setEditLeadSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = buildEmployeeLeadUpdatePayload(editLeadForm);
      const { error: upError } = await supabase.from("clients").update(payload).eq("id", editLeadId);
      if (upError) throw upError;
      setLinkedLeadById((prev) => {
        const prior = prev[editLeadId];
        if (!prior) return prev;
        return {
          ...prev,
          [editLeadId]: {
            ...prior,
            ...payload,
            lead_name: editLeadForm.lead_name.trim() || prior.lead_name,
          } as CrmClientRow,
        };
      });
      setSuccess("Student lead updated.");
      setEditLeadId(null);
      await reload();
    } catch (e) {
      setError(toReadableTaskError(e));
    } finally {
      setEditLeadSubmitting(false);
    }
  };

  const openCollegeEdit = (college: CollegeVisitRow, collegeLoaded: boolean) => {
    if (!collegeLoaded) {
      setError("College details are not loaded yet. Refresh My Tasks and try View again.");
      return;
    }
    setViewTask(null);
    setEditLeadId(null);
    setEditCollegeId(college.id);
    setEditCollegeForm(collegeVisitRowToForm(college));
  };

  const openCollegeActivity = async (college: CollegeVisitRow) => {
    setActivityCollege(college);
    setActivityCollegeLoading(true);
    setActivityCollegeRows([]);
    const res = await fetch(`/api/college-visits/${college.id}/activities`);
    const json = (await res.json().catch(() => ({}))) as {
      activities?: { id: string; activity_type?: string | null; notes?: string | null; created_at: string; created_by?: string | null; old_value?: string | null; new_value?: string | null }[];
      error?: string;
    };
    if (!res.ok) {
      setError(json.error || "Could not load college activity.");
      setActivityCollegeRows([]);
    } else {
      setActivityCollegeRows(
        (json.activities ?? []).map((a) => ({
          id: a.id,
          activity_type: a.activity_type ?? null,
          notes: a.notes ?? null,
          old_value: a.old_value ?? null,
          new_value: a.new_value ?? null,
          created_at: a.created_at,
          created_by: a.created_by ?? null,
        })),
      );
    }
    setActivityCollegeLoading(false);
  };

  const saveCollegeEdit = async () => {
    if (!editCollegeId || !currentUserId) return;
    if (!editCollegeForm.college_name.trim()) {
      setError("College name is required.");
      return;
    }
    setEditCollegeSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/college-visits/${editCollegeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editCollegeForm),
      });
      const json = (await res.json()) as { visit?: CollegeVisitRow; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not update college visit.");
      if (json.visit) {
        setLinkedCollegeById((prev) => ({ ...prev, [editCollegeId]: json.visit! }));
      }
      setSuccess("College visit updated.");
      setEditCollegeId(null);
      await reload();
    } catch (e) {
      setError(toReadableTaskError(e));
    } finally {
      setEditCollegeSubmitting(false);
    }
  };

  const pinButtonLabel = (() => {
    if (pinBusy) return "Pinning...";
    if (linkTypeFilter === "lead") return "Pin selected to Student Master";
    if (linkTypeFilter === "college") return "Pin selected to College Visits";
    if (linkTypeFilter === "project") return "Pin selected to dashboard";
    return "Pin selected";
  })();

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
        if (prior && prior.status !== status) notes.push(`Status â†’ ${status}`);
        if (prior && prior.progress !== progress) notes.push(`Progress â†’ ${progress}%`);
        await logTaskActivity(supabase, {
          taskId,
          actorId: currentUserId,
          activityType: "progress_update",
          notes: notes.join(" Â· ") || "Task updated.",
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
              ? "Work assigned to you by admins, mentors, or freelancers. Update progress and mark tasks complete â€” you cannot assign tasks to others."
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
        placeholder="Search task titleâ€¦"
        showClear={filtersActive}
        onClear={clearTableFilters}
        hint={`Showing ${paginatedRows.length} of ${filteredRows.length} task(s)${linkTypeFilter !== "all" ? ` Â· ${LINK_TYPE_TABS.find((t) => t.id === linkTypeFilter)?.label ?? ""}` : ""}`}
      />

      {isEmployee ? (
        <div className="space-y-3">
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
              ? `Work you delegated â€” track status and activity (read-only). (${filteredRows.length} shown)`
              : `Work assigned to you â€” call/WhatsApp/email linked student leads, update progress, and open View / Activity. (${filteredRows.length} shown)`}
          </p>
        </div>
      ) : null}

      {showLinkTypeTabs ? (
        <div className="flex flex-wrap items-center gap-2">
          {LINK_TYPE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setLinkTypeFilter(tab.id);
                taskSelection.clearSelection();
              }}
              className={
                linkTypeFilter === tab.id
                  ? "rounded-full bg-[#c9a227] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                  : "rounded-full border border-[#e8dcc8] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b] hover:bg-[#f8fbff]"
              }
            >
              {tab.label}
              {tab.id !== "all"
                ? ` (${rows.filter((r) => (r.assignment_type ?? "") === tab.id).length})`
                : ` (${rows.length})`}
            </button>
          ))}
        </div>
      ) : null}

      {taskSelection.selectedCount > 0 ? (
        <BulkSelectionBar selectedCount={taskSelection.selectedCount} totalCount={filteredRows.length} onClear={taskSelection.clearSelection}>
          {(isEmployee || canManageTasks) && !employeeDelegatedView ? (
            <Button
              type="button"
              size="sm"
              disabled={pinBusy}
              className="h-7 rounded-lg bg-[#c9a227] px-3 text-xs text-white hover:bg-[#b8921f] disabled:opacity-60"
              onClick={() => void handleBulkPinSelected()}
            >
              {pinButtonLabel}
            </Button>
          ) : null}
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

      {linkTypeFilter === "lead" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#64748b]">
            Student Lead tasks - one row per linked lead. View opens the Student Master edit form; Activity opens history separately. Pin selected saves leads into Student Master → All Students.
          </p>
          <TaskSubsectionLeadsTable
            rows={subsectionLeadRows}
            employeeNameMap={employeeNameMap}
            loading={loading}
            onViewLead={(_task, lead, leadLoaded) => openLeadEdit(lead, leadLoaded)}
            onActivityLead={(_task, lead) => void openLeadActivity(lead)}
            currentUserId={currentUserId}
            supabase={supabase}
            onOutreachUpdated={() => void reload()}
            onOutreachError={setError}
            onOutreachSuccess={setSuccess}
            selection={{
              allSelected: taskSelection.allSelected,
              someSelected: taskSelection.someSelected,
              isSelected: taskSelection.isSelected,
              onToggleAll: taskSelection.toggleAll,
              onToggle: taskSelection.toggleOne,
            }}
          />
        </div>
      ) : null}

      {linkTypeFilter === "college" ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#64748b]">
            College Visit tasks - columns match College Visits. View / Edit open the college form; Activity opens history. Pin selected saves into College Visits.
          </p>
          <TaskSubsectionCollegesTable
            rows={subsectionCollegeRows}
            ownerNameMap={employeeNameMap}
            loading={loading}
            onViewCollege={(_task, college, collegeLoaded) => openCollegeEdit(college, collegeLoaded)}
            onActivityCollege={(_task, college) => void openCollegeActivity(college)}
            onEditCollege={(_task, college, collegeLoaded) => openCollegeEdit(college, collegeLoaded)}
            selection={{
              allSelected: taskSelection.allSelected,
              someSelected: taskSelection.someSelected,
              isSelected: taskSelection.isSelected,
              onToggleAll: taskSelection.toggleAll,
              onToggle: taskSelection.toggleOne,
            }}
          />
        </div>
      ) : null}

      {linkTypeFilter === "all" || linkTypeFilter === "project" ? (
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
          linkTypePreset={linkTypeFilter}
          showLeadOutreach
          currentUserId={currentUserId}
          supabase={supabase}
          onLeadOutreachUpdated={() => void reload()}
          onLeadOutreachError={setError}
          onLeadOutreachSuccess={setSuccess}
          pagination={{
            page: taskPage,
            totalPages: taskTotalPages,
            totalItems: taskTotalItems,
            pageSize: taskPageSize,
            onPageChange: setTaskPage,
            onPageSizeChange: setTaskPageSize,
          }}
          selection={{
            allSelected: taskSelection.allSelected,
            someSelected: taskSelection.someSelected,
            isSelected: taskSelection.isSelected,
            onToggleAll: taskSelection.toggleAll,
            onToggle: taskSelection.toggleOne,
          }}
        />
      </div>
      ) : null}

      <TaskCompleteDialog
        task={completeTask}
        submitting={completeSubmitting}
        onClose={() => !completeSubmitting && setCompleteTask(null)}
        onSubmit={handleCompleteTaskSubmit}
      />

      {viewTask ? (
        <TaskViewPanel
          task={viewTask}
          employeeNameMap={employeeNameMap}
          supabase={supabase}
          currentUserId={currentUserId}
          linkedLeadRows={
            (viewTask.client_ids ?? [])
              .map((id) => linkedLeadById[id])
              .filter(Boolean) as CrmClientRow[]
          }
          canEdit={!employeeDelegatedView}
          onClose={() => setViewTask(null)}
          onSaved={() => {
            void reload();
          }}
          onLeadOutreachUpdated={() => void reload()}
          onError={setError}
          onSuccess={setSuccess}
        />
      ) : null}

      <StudentLeadFormPanel
        open={!!editLeadId}
        title="Edit student"
        value={editLeadForm}
        programOptions={programOptions}
        employees={Object.entries(employeeNameMap).map(([id, label]) => ({ id, label }))}
        canAssign={false}
        submitting={editLeadSubmitting}
        onChange={setEditLeadForm}
        onClose={() => !editLeadSubmitting && setEditLeadId(null)}
        onSubmit={() => void saveLeadEdit()}
      />

      <LeadActivityModal
        open={!!activityLead}
        title={activityLead ? displayLeadName(activityLead) || "Lead activity" : "Lead activity"}
        subtitle="From lead_activities"
        loading={activityLeadLoading}
        activities={activityLeadRows}
        employeeNameMap={employeeNameMap}
        onClose={() => setActivityLead(null)}
      />

      <CollegeVisitFormPanel
        open={!!editCollegeId}
        title="Edit college visit"
        value={editCollegeForm}
        owners={Object.entries(employeeNameMap).map(([id, label]) => ({ id, label }))}
        submitting={editCollegeSubmitting}
        canAssign={false}
        onChange={setEditCollegeForm}
        onClose={() => !editCollegeSubmitting && setEditCollegeId(null)}
        onSubmit={() => void saveCollegeEdit()}
      />

      <LeadActivityModal
        open={!!activityCollege}
        title={activityCollege?.college_name || "College activity"}
        subtitle="From college_visit_activities"
        loading={activityCollegeLoading}
        activities={activityCollegeRows}
        employeeNameMap={employeeNameMap}
        onClose={() => setActivityCollege(null)}
      />

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
                <span className="flex h-5 w-5 items-center justify-center text-lg font-semibold leading-none">Ã—</span>
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
                selectedCollegeCount={selectedCollegeVisitIds.length}
                selectedCollegePreview={
                  selectedCollegeLabels.length
                    ? selectedCollegeLabels.length <= 2
                      ? selectedCollegeLabels.join(", ")
                      : `${selectedCollegeLabels.slice(0, 2).join(", ")} +${selectedCollegeLabels.length - 2} more`
                    : ""
                }
                collegeSelectionPath={collegeSelectionPath}
                onOpenCollegePicker={handleOpenCollegePicker}
                collegePickerLabel="Open College Visits to select colleges"
                assigneeLockedToSelf={false}
                assigneeHelperText={
                  isEmployee
                    ? "Pick category â†’ department â†’ person. Employees show name and department."
                    : departmentAssigner
                    ? "Only active students in your department are listed."
                    : "Pick Student, Freelancer, Mentor, or Employee â€” then department and person."
                }
                submitting={submitting}
                onChange={(next) => {
                  if (next.assigned_to !== form.assigned_to) {
                    setSelectedClientIds([]);
                    setSelectedLeadLabels([]);
                    setLeadSelectionPath("");
                    setSelectedCollegeVisitIds([]);
                    setSelectedCollegeLabels([]);
                    setCollegeSelectionPath("");
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
