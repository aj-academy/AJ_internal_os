"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { TablePagination } from "@/components/ui/TablePagination";
import { BulkSelectionBar } from "@/components/ui/BulkSelectionBar";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import {
  ResponsiveDataView,
  TABLE_CHECK_TD,
  TABLE_CHECK_TH,
} from "@/components/ui/ResponsiveDataView";
import { usePagination } from "@/lib/usePagination";
import { useRowSelection } from "@/lib/useRowSelection";
import { saveTaskLeadSelection } from "@/lib/taskLeadPickStorage";
import { resolveTaskAssignment } from "@/lib/taskAssignmentDedupe";
import { deleteOwnedClients } from "@/lib/crmOwnedDelete";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/ui/LeadSummaryCard";
import { LeadStatusBadge, ProposalStatusBadge } from "@/components/student-lead-master/LeadStatusBadge";
import {
  ADMISSION_STATUSES,
  CRM_FOLLOW_UP_TYPES_UI,
  CRM_LEAD_STATUSES,
  CRM_PRIORITIES,
  CRM_PROPOSAL_STATUSES,
  CRM_SOURCES,
  CRM_TAB_IDS,
  LEAD_STAGES,
  NEW_PROGRAM_OPTION,
  PAYMENT_STATUSES,
  type CrmProposalStatus,
  type CrmTabId,
} from "@/components/student-lead-master/studentMasterConfig";
import { StudentLeadFormPanel, type StudentLeadFormValue } from "@/components/student-lead-master/StudentLeadFormPanel";
import { ProposalFileUpload, uploadProposalFile } from "@/components/shared/ProposalFileUpload";
import type { ProposalFileMeta } from "@/lib/proposalFiles";
import {
  STUDENT_LEAD_SELECT,
  STUDENT_LEAD_SELECT_NO_PROPOSAL_FILES,
  STUDENT_LEAD_SELECT_NO_CALL_WORKFLOW,
  STUDENT_LEAD_SELECT_NO_PROPOSAL_OR_CALL,
  isMissingStudentProposalFileColumn,
  isMissingCallWorkflowColumn,
  type CrmClientRow,
  displayLeadName,
  formatMoney,
  friendlyError,
  normalizeStatus,
} from "@/components/student-lead-master/studentMasterHelpers";
import {
  CallOutcomeModal,
  LeadCallLiveDashboard,
  PendingCallOutcomeBanner,
} from "@/components/student-lead-master/CallOutcomeModal";
import {
  formatFollowUpFriendly,
  followUpBadge,
  type LeadCallSessionRow,
} from "@/lib/leadCallWorkflow";
import {
  downloadStudentMasterImportTemplate,
  exportStudentMasterCsv,
  parseStudentMasterMatrix,
  studentMasterFileToMatrix,
  STUDENT_MASTER_DATA_COLUMN_COUNT,
} from "@/components/student-lead-master/studentMasterCsv";
import { formatDateTimeIST, formatDisplayDate } from "@/lib/datetime";
import { persistInterestedPrograms } from "@/lib/studentPrograms";
import { useSuppressBackdropClose } from "@/lib/useSuppressBackdropClose";
import {
  defaultCrmSettingsLists,
  fetchCrmSettingsLists,
  linesToList,
  listToLines,
  persistCrmSettingsLists,
  type CrmSettingsLists,
} from "@/lib/crmSettings";
import { StudentOutreachButtons } from "@/components/student-lead-master/StudentOutreachButtons";
import { whatsAppHref } from "@/components/employee/leads/employeeLeadConfig";
import { WhatsAppComposeModal } from "@/components/shared/WhatsAppComposeModal";
import { EmailComposeModal } from "@/components/shared/EmailComposeModal";
import { LeadActivityModal } from "@/components/shared/LeadActivityModal";
import {
  fetchEmailTemplates,
  formatEmailActivityNotes,
  MAX_EMAIL_MESSAGE_LENGTH,
  fetchWhatsAppTemplates,
  formatWhatsAppActivityNotes,
  MAX_WHATSAPP_MESSAGE_LENGTH,
} from "@/lib/whatsappOutreach";

type AppRole = "admin" | "employee";

interface ProfileMini {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface FollowRow {
  id: string;
  client_id: string;
  follow_up_date: string | null;
  follow_up_time: string | null;
  follow_up_type: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
}

interface ActivityRow {
  id: string;
  client_id: string;
  activity_type: string | null;
  notes: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  created_by: string | null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function servicesFromCsv(raw: string | null | undefined) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function csvServices(set: Set<string>) {
  return Array.from(set).join(", ");
}

function logDevSupabase(tag: string, err: unknown) {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console -- intentional dev-only diagnostics
  console.error(`[CRM ${tag}]`, err);
}

function normalizeTimeForDb(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}/.test(t)) return t.slice(0, 8);
  return t;
}

function isIsoDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function emptyForm(
  assignedFallback: string,
  _admin: boolean,
  lists?: Pick<CrmSettingsLists, "leadSources" | "leadStatuses" | "priorityTypes">,
): StudentLeadFormValue {
  const sources = lists?.leadSources?.length ? lists.leadSources : [...CRM_SOURCES];
  const statuses = lists?.leadStatuses?.length ? lists.leadStatuses : [...CRM_LEAD_STATUSES];
  const priorities = lists?.priorityTypes?.length ? lists.priorityTypes : [...CRM_PRIORITIES];
  return {
    lead_name: "",
    phone: "",
    whatsapp: "",
    email: "",
    city: "",
    current_profile: "",
    degree: "",
    college_company: "",
    year_of_passing: "",
    employment_status: "",
    current_salary: "",
    interested_program: "",
    new_program_name: "",
    career_goal: "",
    preferred_job_role: "",
    target_salary: "",
    current_skill_level: "",
    main_career_problem: "",
    joining_timeline: "",
    budget: "",
    payment_plan: "",
    parent_approval_required: "",
    decision_maker: "",
    preferred_batch: "",
    laptop_availability: "",
    source: sources[0] ?? CRM_SOURCES[0],
    assigned_to: assignedFallback,
    lead_stage: "",
    status: statuses.includes("New") ? "New" : (statuses[0] ?? "New"),
    priority: priorities.includes("Warm") ? "Warm" : (priorities[0] ?? "Warm"),
    follow_up_date: "",
    follow_up_time: "",
    follow_up_type: "",
    fee_quoted: "",
    final_fee: "",
    payment_status: "",
    admission_status: "",
    notes: "",
    company_name: "",
    industry: "",
    requirement: "",
    expected_start_date: "",
    lead_score: "0",
    service_interests: new Set<string>(),
    proposal_status: "Not Sent",
    proposal_amount: "",
    proposal_sent_date: "",
    proposal_link: "",
    quotation_link: "",
    agreement_link: "",
  };
}

async function insertActivityClient(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  activity_type: string,
  notes: string | null,
  userId: string,
  old_value?: string | null,
  new_value?: string | null,
) {
  if (!clientId?.trim()) throw new Error("Activity log failed: missing client.");
  if (!userId?.trim()) throw new Error("Activity log failed: missing user session.");
  const { error } = await supabase.from("lead_activities").insert({
    client_id: clientId,
    activity_type,
    notes: notes?.trim() ? notes.trim() : null,
    old_value: old_value ?? null,
    new_value: new_value ?? null,
    created_by: userId,
  });
  if (error) {
    logDevSupabase("lead_activities.insert", error);
    throw new Error(error.message);
  }
}

async function fetchFollowupsAndActivitiesForIds(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
): Promise<{ follows: FollowRow[]; activities: ActivityRow[] }> {
  if (!ids.length) return { follows: [], activities: [] };
  const chunkSize = 120;
  const allFollows: FollowRow[] = [];
  const allActivities: ActivityRow[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const [fr, ar] = await Promise.all([
      supabase
        .from("lead_followups")
        .select("id,client_id,follow_up_date,follow_up_time,follow_up_type,status,notes,created_at")
        .in("client_id", slice)
        .order("follow_up_date", { ascending: true })
        .limit(500),
      supabase
        .from("lead_activities")
        .select("id,client_id,activity_type,notes,old_value,new_value,created_at,created_by")
        .in("client_id", slice)
        .order("created_at", { ascending: false })
        .limit(400),
    ]);
    if (fr.error) {
      logDevSupabase("lead_followups.select", fr.error);
      throw new Error(fr.error.message);
    }
    if (ar.error) {
      logDevSupabase("lead_activities.select", ar.error);
      throw new Error(ar.error.message);
    }
    allFollows.push(...((fr.data as FollowRow[] | null) ?? []));
    allActivities.push(...((ar.data as ActivityRow[] | null) ?? []));
  }
  allActivities.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { follows: allFollows, activities: allActivities.slice(0, 500) };
}

function pickEmployeePayload(base: Record<string, unknown>) {
  const keys = [
    "requirement",
    "budget",
    "expected_start_date",
    "notes",
    "follow_up_date",
    "follow_up_time",
    "follow_up_type",
    "status",
    "priority",
    "proposal_status",
    "proposal_amount",
    "proposal_sent_date",
    "proposal_link",
    "quotation_link",
    "agreement_link",
    "service_interest",
    "interested_program",
    "current_profile",
    "degree",
    "college_company",
    "year_of_passing",
    "employment_status",
    "current_salary",
    "career_goal",
    "preferred_job_role",
    "target_salary",
    "current_skill_level",
    "main_career_problem",
    "joining_timeline",
    "payment_plan",
    "parent_approval_required",
    "decision_maker",
    "preferred_batch",
    "laptop_availability",
    "lead_stage",
    "fee_quoted",
    "final_fee",
    "payment_status",
    "admission_status",
  ];
  const out: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (key in base) out[key] = base[key];
  });
  return out;
}

function isClosedLeadStatus(status: string | null | undefined) {
  const s = normalizeStatus(String(status ?? ""));
  return ["Admitted", "Converted", "Lost", "Not Interested"].includes(s);
}

function numOrNull(raw: string) {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function StudentMasterWorkbench({ role, fullAccess = false }: { role: AppRole; fullAccess?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pickForTask = searchParams.get("pickForTask") === "1";
  const defaultReturnTo = role === "admin" ? "/admin/task-assignment" : "/employee/my-tasks";
  const returnTo = searchParams.get("returnTo") || defaultReturnTo;
  const isEmployeePortal = role === "employee";
  /** True admin only — sees all leads; bulk assign / admit / delete. */
  const isAdmin = role === "admin";
  const isDbAdmin = isAdmin;
  /** Employee portal write UX for own assigned leads (add / import / edit own). */
  const canWriteOwnLeads = isAdmin || (isEmployeePortal && fullAccess);
  const visibleTabIds = useMemo(
    () => (isEmployeePortal ? CRM_TAB_IDS.filter((id) => id !== "reports" && id !== "settings") : [...CRM_TAB_IDS]),
    [isEmployeePortal],
  );

  const [pickedLeadIds, setPickedLeadIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<CrmTabId>("overview");
  const [currentUserId, setCurrentUserId] = useState("");
  const [employees, setEmployees] = useState<ProfileMini[]>([]);

  const [clients, setClients] = useState<CrmClientRow[]>([]);
  const [followRows, setFollowRows] = useState<FollowRow[]>([]);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchText, setSearchText] = useState("");
  const [fltStatus, setFltStatus] = useState("");
  const [fltSource, setFltSource] = useState("");
  const [fltPriority, setFltPriority] = useState("");
  const [fltProgram, setFltProgram] = useState("");
  const [fltDegree, setFltDegree] = useState("");
  const [fltAssigned, setFltAssigned] = useState("");
  const [fltStage, setFltStage] = useState("");
  const [fltPaymentStatus, setFltPaymentStatus] = useState("");
  const [fltAdmissionStatus, setFltAdmissionStatus] = useState("");

  const [interestedPrograms, setInterestedPrograms] = useState<string[]>([]);
  const [crmLists, setCrmLists] = useState<CrmSettingsLists>(() => defaultCrmSettingsLists());
  const [whatsAppTemplates, setWhatsAppTemplates] = useState<string[]>([]);
  const [whatsAppComposeLead, setWhatsAppComposeLead] = useState<CrmClientRow | null>(null);
  const [whatsAppSubmitting, setWhatsAppSubmitting] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<string[]>([]);
  const [emailComposeLead, setEmailComposeLead] = useState<CrmClientRow | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [activityModalLead, setActivityModalLead] = useState<CrmClientRow | null>(null);
  const [activityModalRows, setActivityModalRows] = useState<ActivityRow[]>([]);
  const [activityModalLoading, setActivityModalLoading] = useState(false);
  const [pendingCallSessions, setPendingCallSessions] = useState<LeadCallSessionRow[]>([]);
  const [callOutcomeSession, setCallOutcomeSession] = useState<LeadCallSessionRow | null>(null);
  const [callOutcomeSubmitting, setCallOutcomeSubmitting] = useState(false);
  const [callLiveStats, setCallLiveStats] = useState<{
    callsToday: number;
    connectedToday: number;
    unansweredToday: number;
    pendingOutcomes: number;
  } | null>(null);
  const [callLiveRows, setCallLiveRows] = useState<
    Array<{
      id: string;
      lead_name?: string;
      employee_name?: string | null;
      started_at: string;
      elapsed_seconds?: number;
      session_status: string;
    }>
  >([]);
  const [hidePendingBanner, setHidePendingBanner] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<StudentLeadFormValue>(() => emptyForm("", true));

  const [profileLead, setProfileLead] = useState<CrmClientRow | null>(null);
  const [followModalFor, setFollowModalFor] = useState<CrmClientRow | null>(null);
  const [followDraft, setFollowDraft] = useState({
    date: "",
    time: "",
    type: "Call",
    notes: "",
  });

  const [proposalModalLead, setProposalModalLead] = useState<CrmClientRow | null>(null);
  const [proposalDraft, setProposalDraft] = useState({
    status: "Not Sent" as CrmProposalStatus,
    amount: "",
    sent_date: "",
    proposal_link: "",
    quotation_link: "",
    agreement_link: "",
  });
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [pendingProposalFile, setPendingProposalFile] = useState<File | null>(null);
  const [proposalFileMeta, setProposalFileMeta] = useState<ProposalFileMeta>({
    proposal_file_name: null,
    proposal_file_path: null,
    proposal_file_type: null,
    proposal_file_size: null,
    proposal_uploaded_at: null,
    proposal_link: null,
  });

  const employeeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((employee) => {
      map[employee.id] = employee.full_name || employee.email || employee.id.slice(0, 8);
    });
    return map;
  }, [employees]);

  const employeesForSelect = useMemo(
    () =>
      employees.map((employee) => ({
        id: employee.id,
        label: employee.full_name || employee.email || "Unnamed",
        email: employee.email,
      })),
    [employees],
  );

  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  /** Leads pinned from My Tasks (employee CRM workspace, not ownership transfer). */
  const [crmPinIds, setCrmPinIds] = useState<Set<string>>(() => new Set());

  const buildClientsBaseQuery = useCallback(
    (select = STUDENT_LEAD_SELECT) => {
      // Admin: all employee leads (activity tracking). Employee: own assigned_to only.
      let q = supabase
        .from("clients")
        .select(select)
        .order("updated_at", { ascending: false })
        .limit(isAdmin ? 1200 : 300);
      if (!isAdmin && currentUserId) q = q.eq("assigned_to", currentUserId);
      return q.returns<CrmClientRow[]>();
    },
    [currentUserId, isAdmin, supabase],
  );

  const mergePinnedLeads = useCallback(
    async (owned: CrmClientRow[]): Promise<{ merged: CrmClientRow[]; pinIds: Set<string> }> => {
      if (isAdmin) return { merged: owned, pinIds: new Set() };
      try {
        const res = await fetch("/api/tasks/crm-pins?type=lead&full=1");
        const json = (await res.json()) as { ids?: string[]; clients?: CrmClientRow[]; error?: string };
        if (!res.ok) {
          // Pins table may not exist yet — keep owned rows only
          return { merged: owned, pinIds: new Set() };
        }
        const pinIds = new Set((json.clients ?? []).map((row) => String(row.id)).filter(Boolean));
        const byId = new Map(owned.map((c) => [c.id, c]));
        for (const row of json.clients ?? []) {
          if (row?.id && !byId.has(row.id)) byId.set(row.id, row);
        }
        const merged = [...byId.values()].sort((a, b) =>
          String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
        );
        return { merged, pinIds };
      } catch {
        return { merged: owned, pinIds: new Set() };
      }
    },
    [isAdmin],
  );

  const loadClientsDataset = useCallback(async () => {
    const trySelect = async (select: string) => buildClientsBaseQuery(select);
    let { data, error: loadError } = await trySelect(STUDENT_LEAD_SELECT);
    if (loadError && (isMissingStudentProposalFileColumn(loadError.message) || isMissingCallWorkflowColumn(loadError.message))) {
      if (isMissingStudentProposalFileColumn(loadError.message) && isMissingCallWorkflowColumn(loadError.message)) {
        ({ data, error: loadError } = await trySelect(STUDENT_LEAD_SELECT_NO_PROPOSAL_OR_CALL));
      } else if (isMissingCallWorkflowColumn(loadError.message)) {
        ({ data, error: loadError } = await trySelect(STUDENT_LEAD_SELECT_NO_CALL_WORKFLOW));
        if (loadError && isMissingStudentProposalFileColumn(loadError.message)) {
          ({ data, error: loadError } = await trySelect(STUDENT_LEAD_SELECT_NO_PROPOSAL_OR_CALL));
        }
      } else {
        ({ data, error: loadError } = await trySelect(STUDENT_LEAD_SELECT_NO_PROPOSAL_FILES));
        if (loadError && isMissingCallWorkflowColumn(loadError.message)) {
          ({ data, error: loadError } = await trySelect(STUDENT_LEAD_SELECT_NO_PROPOSAL_OR_CALL));
        }
      }
    }
    if (loadError) throw new Error(loadError.message);
    const { merged, pinIds } = await mergePinnedLeads(data ?? []);
    setCrmPinIds(pinIds);
    setClients(merged);
  }, [buildClientsBaseQuery, mergePinnedLeads]);

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setError(null);
    setLoading(true);
    try {
      const lists = await fetchCrmSettingsLists(supabase);
      setCrmLists(lists);
      setInterestedPrograms(lists.interestedPrograms);
      const templates = await fetchWhatsAppTemplates(supabase);
      setWhatsAppTemplates(templates);
      const emailTpls = await fetchEmailTemplates(supabase);
      setEmailTemplates(emailTpls);
      await Promise.all([loadClientsDataset()]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadClientsDataset, supabase]);

  /** Refresh clients + follow-ups + activities + overview without full-page loading spinner. */
  const silentRefreshCrm = useCallback(async () => {
    if (!currentUserId) return;
    try {
      let { data, error: loadError } = await buildClientsBaseQuery();
      if (loadError && isMissingStudentProposalFileColumn(loadError.message)) {
        ({ data, error: loadError } = await buildClientsBaseQuery(STUDENT_LEAD_SELECT_NO_PROPOSAL_FILES));
      }
      if (loadError) throw new Error(loadError.message);
      const { merged: next, pinIds } = await mergePinnedLeads(data ?? []);
      setCrmPinIds(pinIds);
      setClients(next);
      const ids = next.map((c) => c.id);
      if (!ids.length) {
        setFollowRows([]);
        setActivityRows([]);
      } else {
        const { follows, activities } = await fetchFollowupsAndActivitiesForIds(supabase, ids);
        setFollowRows(follows);
        setActivityRows(activities);
      }
    } catch (e) {
      setError(friendlyError(e));
      logDevSupabase("silentRefreshCrm", e);
    }
  }, [buildClientsBaseQuery, currentUserId, mergePinnedLeads, supabase]);

  useEffect(() => {
    void loadEmployees();
    async function loadEmployees() {
      const { data, error: profilesError } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("role", ["employee", "manager", "admin", "super_admin"])
        .eq("status", "active")
        .order("full_name", { ascending: true });
      if (!profilesError) setEmployees((data ?? []) as ProfileMini[]);
    }

    async function bootstrap() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user?.id) {
        setError(friendlyError(userError ?? new Error("Not authenticated.")));
        return;
      }
      setCurrentUserId(user.id);
    }
    void bootstrap();
  }, [supabase]);

  useEffect(() => {
    if (!currentUserId) return;
    void reload();
  }, [currentUserId, reload]);

  useEffect(() => {
    const ids = clients.map((clientRow) => clientRow.id);
    if (!ids.length) {
      setFollowRows([]);
      setActivityRows([]);
      return;
    }
    void (async () => {
      try {
        const { follows, activities } = await fetchFollowupsAndActivitiesForIds(supabase, ids);
        setFollowRows(follows);
        setActivityRows(activities);
      } catch (e) {
        setError(friendlyError(e));
        logDevSupabase("fetchFollowupsAndActivitiesForIds", e);
      }
    })();
  }, [clients, supabase]);

  useEffect(() => {
    if (!currentUserId) return;
    const ch = supabase
      .channel("crm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_followups" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_activities" }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [currentUserId, reload, supabase]);

  const filteredClients = useMemo(() => {
    let list = [...clients];
    const query = searchText.trim().toLowerCase();
    if (query) {
      list = list.filter((c) =>
        `${displayLeadName(c)} ${c.college_company ?? ""} ${c.company_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""} ${c.whatsapp ?? ""} ${c.city ?? ""}`
          .toLowerCase()
          .includes(query),
      );
    }
    if (fltStatus) list = list.filter((c) => normalizeStatus(String(c.status)) === fltStatus);
    if (fltSource) list = list.filter((c) => (c.source || "") === fltSource);
    if (fltPriority) list = list.filter((c) => (c.priority || "") === fltPriority);
    if (fltProgram) {
      list = list.filter((c) => {
        const program = String(c.interested_program || c.service_interest || "");
        return program === fltProgram || servicesFromCsv(program).includes(fltProgram);
      });
    }
    if (fltDegree) list = list.filter((c) => (c.degree || "") === fltDegree);
    if (fltAssigned) list = list.filter((c) => (c.assigned_to || "") === fltAssigned);
    if (fltStage) list = list.filter((c) => (c.lead_stage || "") === fltStage);
    if (fltPaymentStatus) list = list.filter((c) => (c.payment_status || "") === fltPaymentStatus);
    if (fltAdmissionStatus) list = list.filter((c) => (c.admission_status || "") === fltAdmissionStatus);
    return list;
  }, [
    clients,
    fltAdmissionStatus,
    fltDegree,
    fltAssigned,
    fltPaymentStatus,
    fltPriority,
    fltProgram,
    fltSource,
    fltStage,
    fltStatus,
    searchText,
  ]);

  const overview = useMemo(() => {
    const todayStr = todayISO();
    const closedStatuses = new Set(["Converted", "Admitted", "Lost", "Not Interested"]);
    const scope =
      isAdmin && fltAssigned ? clients.filter((c) => (c.assigned_to || "") === fltAssigned) : clients;
    let newLeads = 0;
    let contacted = 0;
    let interested = 0;
    let proposalSent = 0;
    let converted = 0;
    let lost = 0;
    let followToday = 0;
    let overdue = 0;
    let revenuePotential = 0;
    for (const c of scope) {
      const st = normalizeStatus(String(c.status));
      if (st === "New" || st === "New Lead") newLeads += 1;
      if (st === "Contacted") contacted += 1;
      if (st === "Interested") interested += 1;
      if (st === "Fee Discussed") proposalSent += 1;
      if (st === "Converted" || st === "Admitted") converted += 1;
      if (st === "Lost" || st === "Not Interested") lost += 1;
      const fu = (c.follow_up_date || "").slice(0, 10);
      if (fu === todayStr) followToday += 1;
      if (fu && fu < todayStr && !closedStatuses.has(st)) overdue += 1;
      if (isAdmin && c.budget != null && !closedStatuses.has(st)) {
        revenuePotential += Number(c.budget) || 0;
      }
    }
    return {
      total: scope.length,
      newLeads,
      contacted,
      interested,
      proposalSent,
      converted,
      lost,
      followToday,
      overdue,
      revenuePotential,
    };
  }, [clients, fltAssigned, isAdmin]);

  const filteredClientIds = useMemo(() => new Set(filteredClients.map((c) => c.id)), [filteredClients]);

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const clientMapFiltered = useMemo(
    () => Object.fromEntries(filteredClients.map((c) => [c.id, c])),
    [filteredClients],
  );

  const followRowsFiltered = useMemo(
    () => followRows.filter((f) => filteredClientIds.has(f.client_id)),
    [followRows, filteredClientIds],
  );

  const activityRowsFiltered = useMemo(
    () => activityRows.filter((a) => filteredClientIds.has(a.client_id)),
    [activityRows, filteredClientIds],
  );

  const {
    paginatedItems: paginatedClients,
    page: leadsPage,
    setPage: setLeadsPage,
    totalPages: leadsTotalPages,
    totalItems: leadsTotalItems,
    pageSize: leadsPageSize,
    setPageSize: setLeadsPageSize,
  } = usePagination(filteredClients, 12);

  const leadsForBulk = useMemo(() => {
    if (pickForTask) return [];
    if (activeTab === "all-leads") return filteredClients;
    if (activeTab === "converted") {
      return filteredClients.filter((leadEntry) => {
        const st = normalizeStatus(String(leadEntry.status));
        return st === "Converted" || st === "Admitted";
      });
    }
    if (activeTab === "proposal") return filteredClients;
    return [];
  }, [activeTab, filteredClients, pickForTask]);

  const leadBulk = useRowSelection(leadsForBulk, (lead) => lead.id);
  const [bulkAssignTo, setBulkAssignTo] = useState("");

  const rowsForExport = useMemo(() => {
    if (leadBulk.selectedCount > 0) {
      return filteredClients.filter((c) => leadBulk.selected.has(c.id));
    }
    if (activeTab === "converted") {
      return filteredClients.filter((leadEntry) => {
        const st = normalizeStatus(String(leadEntry.status));
        return st === "Converted" || st === "Admitted";
      });
    }
    return filteredClients;
  }, [activeTab, filteredClients, leadBulk.selected, leadBulk.selectedCount]);

  useEffect(() => {
    leadBulk.clearSelection();
    setBulkAssignTo("");
  }, [activeTab, pickForTask]);

  useEffect(() => {
    if (pickForTask) setActiveTab("all-leads");
  }, [pickForTask]);

  useEffect(() => {
    if (isEmployeePortal && (activeTab === "reports" || activeTab === "settings")) {
      setActiveTab("overview");
    }
  }, [activeTab, isEmployeePortal]);

  const togglePickLead = (id: string) => {
    setPickedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tabLabels: Record<CrmTabId, string> = {
    overview: "Overview",
    "all-leads": "All Students",
    "follow-ups": "Follow-ups",
    pipeline: "Pipeline",
    converted: "Admitted Students",
    proposal: "Proposal Tracker",
    timeline: "Activity Timeline",
    reports: "Reports",
    settings: "Settings",
  };

  const confirmLeadPick = () => {
    const labels = clients.filter((c) => pickedLeadIds.has(c.id)).map((c) => displayLeadName(c));
    const pathParts = ["Student Master", tabLabels[activeTab]];
    if (fltStatus) pathParts.push(`Status=${fltStatus}`);
    if (fltPriority) pathParts.push(`Priority=${fltPriority}`);
    if (fltSource) pathParts.push(`Source=${fltSource}`);
    if (searchText.trim()) pathParts.push(`Search="${searchText.trim()}"`);
    saveTaskLeadSelection({
      ids: [...pickedLeadIds],
      labels,
      filterPath: pathParts.join(" → "),
    });
    router.push(decodeURIComponent(returnTo));
  };

  const filtersActive = Boolean(
    searchText.trim() ||
      fltStatus ||
      fltSource ||
      fltPriority ||
      fltProgram ||
      fltDegree ||
      fltAssigned ||
      fltStage ||
      fltPaymentStatus ||
      fltAdmissionStatus,
  );

  const clearTableFilters = () => {
    setSearchText("");
    setFltStatus("");
    setFltSource("");
    setFltPriority("");
    setFltProgram("");
    setFltDegree("");
    setFltAssigned("");
    setFltStage("");
    setFltPaymentStatus("");
    setFltAdmissionStatus("");
  };

  const degreeOptions = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      const d = String(c.degree || "").trim();
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [clients]);

  const overviewCharts = useMemo(() => {
    const src: Record<string, number> = {};
    const pipe: Record<string, number> = {};
    const monthBucket: Record<string, number> = {};
    const scope =
      isAdmin && fltAssigned ? clients.filter((c) => (c.assigned_to || "") === fltAssigned) : clients;
    scope.forEach((c) => {
      const so = String(c.source || "Unknown");
      src[so] = (src[so] || 0) + 1;
      const st = normalizeStatus(String(c.status));
      pipe[String(st)] = (pipe[String(st)] || 0) + 1;
      if (c.created_at) {
        const mk = monthKeyFromDate(new Date(String(c.created_at)));
        monthBucket[mk] = (monthBucket[mk] || 0) + 1;
      }
    });
    const monthsSorted = Object.entries(monthBucket).sort(([a], [b]) => a.localeCompare(b));
    return {
      sources: Object.entries(src).sort((a, b) => b[1] - a[1]),
      pipe: Object.entries(pipe),
      months: monthsSorted,
    };
  }, [clients, fltAssigned, isAdmin]);

  const patchClientLocal = useCallback((id: string, patch: Partial<CrmClientRow>) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setProfileLead((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  }, []);

  const canContactLead = useCallback(
    (lead: CrmClientRow) => isAdmin || lead.assigned_to === currentUserId || crmPinIds.has(lead.id),
    [crmPinIds, currentUserId, isAdmin],
  );

  const canEditLead = useCallback(
    (lead: CrmClientRow) => isAdmin || lead.assigned_to === currentUserId || crmPinIds.has(lead.id),
    [crmPinIds, currentUserId, isAdmin],
  );

  const handlePhoneClick = async (lead: CrmClientRow, opts?: { adminOverride?: boolean }) => {
    if (!canContactLead(lead)) {
      const owner = lead.assigned_to ? employeeNameMap[lead.assigned_to] || "another employee" : "another employee";
      setError(`This lead is assigned to ${owner}. Contact the admin if reassignment is required.`);
      return;
    }
    const phone = lead.phone?.trim();
    if (!phone) {
      setError("No mobile number on this student.");
      return;
    }

    setError(null);
    try {
      const res = await fetch("/api/leads/call/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          sourcePage: "student_master",
          adminOverride: Boolean(opts?.adminOverride),
        }),
      });
      const json = (await res.json()) as Record<string, unknown>;

      if (res.status === 409 && json.code === "active_call") {
        const msg = String(json.error || "Another employee is already calling this lead.");
        if (isAdmin && json.can_override) {
          const ok = window.confirm(`${msg}\n\nOverride and start your own call session?`);
          if (ok) {
            await handlePhoneClick(lead, { adminOverride: true });
          }
          return;
        }
        setError(msg);
        return;
      }

      if (!res.ok || json.ok !== true) {
        setError(String(json.error || "Could not start call session."));
        return;
      }

      const sessionId = String(json.session_id || "");
      const startedAt = String(json.started_at || new Date().toISOString());
      const dialPhone = String(json.phone_number || phone);
      const attempts =
        typeof json.total_call_attempts === "number"
          ? json.total_call_attempts
          : (lead.total_call_attempts || 0) + 1;

      patchClientLocal(lead.id, {
        phone_called: true,
        phone_called_at: lead.phone_called_at || startedAt,
        current_call_employee_id: currentUserId,
        current_call_started_at: startedAt,
        current_call_session_id: sessionId,
        total_call_attempts: attempts,
      });

      const pendingSession: LeadCallSessionRow = {
        id: sessionId,
        lead_id: lead.id,
        employee_id: currentUserId,
        employee_name: employeeNameMap[currentUserId] || "You",
        phone_number: dialPhone,
        started_at: startedAt,
        ended_at: null,
        approximate_duration_seconds: null,
        session_status: "outcome_pending",
        call_outcome: null,
        notes: null,
        next_action: null,
        lead_stage_at_start: lead.lead_stage || lead.status || null,
        lead_stage_after: null,
        source_page: "student_master",
        lead_name: displayLeadName(lead),
      };
      setPendingCallSessions((prev) => {
        const without = prev.filter((s) => s.id !== sessionId && s.lead_id !== lead.id);
        return [pendingSession, ...without];
      });
      setHidePendingBanner(false);
      setCallOutcomeSession(pendingSession);

      window.location.href = `tel:${dialPhone}`;
      setSuccess(`Calling ${displayLeadName(lead)} — update the outcome when you return.`);
      void refreshCallWorkflow();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const refreshCallWorkflow = useCallback(async () => {
    try {
      const [pendingRes, liveRes] = await Promise.all([
        fetch("/api/leads/call/pending"),
        fetch("/api/leads/call/live"),
      ]);
      if (pendingRes.ok) {
        const pendingJson = (await pendingRes.json()) as {
          sessions?: LeadCallSessionRow[];
          schemaMissing?: boolean;
        };
        if (!pendingJson.schemaMissing) {
          setPendingCallSessions(pendingJson.sessions || []);
        }
      }
      if (liveRes.ok) {
        const liveJson = (await liveRes.json()) as {
          live?: typeof callLiveRows;
          stats?: typeof callLiveStats;
          schemaMissing?: boolean;
        };
        if (!liveJson.schemaMissing) {
          setCallLiveRows(liveJson.live || []);
          setCallLiveStats(liveJson.stats || null);
        }
      }
    } catch {
      // schema may not be applied yet
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    void refreshCallWorkflow();
    const t = window.setInterval(() => void refreshCallWorkflow(), 45_000);
    return () => window.clearInterval(t);
  }, [currentUserId, refreshCallWorkflow]);

  const submitCallOutcome = async (payload: Record<string, unknown>) => {
    setCallOutcomeSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/call/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok || !json.ok) {
        setError(json.error || "Could not save call outcome.");
        return;
      }
      setCallOutcomeSession(null);
      setSuccess("Call outcome saved.");
      await Promise.all([silentRefreshCrm(), refreshCallWorkflow()]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setCallOutcomeSubmitting(false);
    }
  };

  const openWhatsAppCompose = (lead: CrmClientRow) => {
    if (!canContactLead(lead)) return;
    if (!whatsAppHref(lead.whatsapp || lead.phone)) {
      setError("No WhatsApp number on this student.");
      return;
    }
    setWhatsAppComposeLead(lead);
  };

  const handleWhatsAppSend = async (message: string) => {
    if (!whatsAppComposeLead || !currentUserId) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Enter a message before opening WhatsApp.");
      return;
    }
    if (trimmed.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
      setError(`Message is too long (max ${MAX_WHATSAPP_MESSAGE_LENGTH} characters).`);
      return;
    }

    const lead = whatsAppComposeLead;
    const wa = whatsAppHref(lead.whatsapp || lead.phone, trimmed);
    if (!wa) {
      setError("No WhatsApp number on this student.");
      return;
    }

    setWhatsAppSubmitting(true);
    setError(null);
    const now = new Date().toISOString();
    const activityNotes = formatWhatsAppActivityNotes(trimmed);

    patchClientLocal(lead.id, { whatsapp_sent: true, whatsapp_sent_at: now, last_contacted_at: now });
    window.open(wa, "_blank", "noopener,noreferrer");

    const { error: updateError } = await supabase
      .from("clients")
      .update({ whatsapp_sent: true, whatsapp_sent_at: now, last_contacted_at: now })
      .eq("id", lead.id);

    if (updateError) {
      setError(updateError.message);
      setWhatsAppSubmitting(false);
      await reload();
      return;
    }

    const activity: ActivityRow = {
      id: `local-${Date.now()}`,
      client_id: lead.id,
      activity_type: "WhatsApp Message",
      notes: activityNotes,
      old_value: null,
      new_value: null,
      created_at: now,
      created_by: currentUserId,
    };
    setActivityRows((prev) => [activity, ...prev]);
    try {
      await insertActivityClient(supabase, lead.id, "WhatsApp Message", activityNotes, currentUserId);
    } catch (e) {
      setError(friendlyError(e));
      setWhatsAppSubmitting(false);
      return;
    }

    setWhatsAppComposeLead(null);
    setSuccess("WhatsApp opened and message saved to activity history.");
    setWhatsAppSubmitting(false);
  };

  const openActivityForLead = async (lead: CrmClientRow) => {
    setActivityModalLead(lead);
    setActivityModalLoading(true);
    setActivityModalRows([]);
    const { data, error: actError } = await supabase
      .from("lead_activities")
      .select("id,client_id,activity_type,notes,old_value,new_value,created_at,created_by")
      .eq("client_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (actError) setError(actError.message);
    else setActivityModalRows((data ?? []) as ActivityRow[]);
    setActivityModalLoading(false);
  };

  const openEmailCompose = (lead: CrmClientRow) => {
    if (!canContactLead(lead)) return;
    const email = lead.email?.trim();
    if (!email) {
      setError("No email address on this student.");
      return;
    }
    setEmailComposeLead(lead);
  };

  const handleEmailSend = async (message: string) => {
    if (!emailComposeLead || !currentUserId) return;
    const email = emailComposeLead.email?.trim();
    if (!email) {
      setError("No email address on this student.");
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Enter a message before sending email.");
      return;
    }
    if (trimmed.length > MAX_EMAIL_MESSAGE_LENGTH) {
      setError(`Message is too long (max ${MAX_EMAIL_MESSAGE_LENGTH} characters).`);
      return;
    }

    setEmailSubmitting(true);
    setError(null);
    const lead = emailComposeLead;
    const now = new Date().toISOString();
    const activityNotes = formatEmailActivityNotes(trimmed);
    const subject = `AJ Academy follow-up for ${displayLeadName(lead)}`;

    try {
      const mailRes = await fetch("/api/outreach/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, subject, body: trimmed }),
      });
      const mailPayload = (await mailRes.json().catch(() => ({}))) as { error?: string };
      if (!mailRes.ok) {
        setError(mailPayload.error || "Could not send email.");
        setEmailSubmitting(false);
        return;
      }
    } catch {
      setError("Could not reach the email server.");
      setEmailSubmitting(false);
      return;
    }

    patchClientLocal(lead.id, { email_sent: true, email_sent_at: now, last_contacted_at: now });
    let updateError = (
      await supabase
        .from("clients")
        .update({ email_sent: true, email_sent_at: now, last_contacted_at: now })
        .eq("id", lead.id)
    ).error;
    if (updateError) {
      const fallback = await supabase.from("clients").update({ last_contacted_at: now }).eq("id", lead.id);
      updateError = fallback.error;
    }
    if (updateError) {
      setError(updateError.message);
      setEmailSubmitting(false);
      await reload();
      return;
    }
    const activity: ActivityRow = {
      id: `local-${Date.now()}`,
      client_id: lead.id,
      activity_type: "Email",
      notes: activityNotes,
      old_value: null,
      new_value: null,
      created_at: now,
      created_by: currentUserId,
    };
    setActivityRows((prev) => [activity, ...prev]);
    try {
      await insertActivityClient(supabase, lead.id, "Email", activityNotes, currentUserId);
    } catch (e) {
      setError(friendlyError(e));
      setEmailSubmitting(false);
      return;
    }
    setEmailComposeLead(null);
    setSuccess("Email sent from ajacademy.co.in@gmail.com and saved to activity history.");
    setEmailSubmitting(false);
  };

  function rowToForm(lead: CrmClientRow): StudentLeadFormValue {
    const interests = servicesFromCsv(String(lead.service_interest ?? ""));
    return {
      lead_name: displayLeadName(lead) || String(lead.name ?? ""),
      phone: lead.phone ?? "",
      whatsapp: lead.whatsapp ?? "",
      email: lead.email ?? "",
      city: lead.city ?? "",
      current_profile: lead.current_profile ?? "",
      degree: lead.degree ?? "",
      college_company: lead.college_company ?? lead.company_name ?? "",
      year_of_passing: lead.year_of_passing ?? "",
      employment_status: lead.employment_status ?? "",
      current_salary: lead.current_salary != null ? String(lead.current_salary) : "",
      interested_program: lead.interested_program ?? interests[0] ?? "",
      new_program_name: "",
      career_goal: lead.career_goal ?? "",
      preferred_job_role: lead.preferred_job_role ?? "",
      target_salary: lead.target_salary != null ? String(lead.target_salary) : "",
      current_skill_level: lead.current_skill_level ?? "",
      main_career_problem: lead.main_career_problem ?? lead.requirement ?? "",
      joining_timeline: lead.joining_timeline ?? "",
      budget: lead.budget != null ? String(lead.budget) : "",
      payment_plan: lead.payment_plan ?? "",
      parent_approval_required: lead.parent_approval_required ?? "",
      decision_maker: lead.decision_maker ?? "",
      preferred_batch: lead.preferred_batch ?? "",
      laptop_availability: lead.laptop_availability ?? "",
      source: (lead.source as string) || CRM_SOURCES[0],
      assigned_to: lead.assigned_to ?? "",
      lead_stage: lead.lead_stage ?? "",
      status: normalizeStatus(String(lead.status)),
      priority: lead.priority ?? "Warm",
      follow_up_date: lead.follow_up_date ? String(lead.follow_up_date).slice(0, 10) : "",
      follow_up_time: lead.follow_up_time ? String(lead.follow_up_time).slice(0, 5) : "",
      follow_up_type: lead.follow_up_type ?? "",
      fee_quoted: lead.fee_quoted != null ? String(lead.fee_quoted) : lead.proposal_amount != null ? String(lead.proposal_amount) : "",
      final_fee: lead.final_fee != null ? String(lead.final_fee) : "",
      payment_status: lead.payment_status ?? "",
      admission_status: lead.admission_status ?? "",
      notes: lead.notes ?? "",
      company_name: lead.company_name ?? "",
      industry: lead.industry ?? "",
      requirement: lead.requirement ?? "",
      expected_start_date: lead.expected_start_date ?? "",
      lead_score: lead.lead_score != null ? String(lead.lead_score) : "0",
      service_interests: new Set(interests),
      proposal_status: (lead.proposal_status as CrmProposalStatus) ?? "Not Sent",
      proposal_amount: lead.proposal_amount != null ? String(lead.proposal_amount) : "",
      proposal_sent_date: lead.proposal_sent_date ?? "",
      proposal_link: lead.proposal_link ?? "",
      quotation_link: lead.quotation_link ?? "",
      agreement_link: lead.agreement_link ?? "",
    };
  }

  function buildPayload(v: StudentLeadFormValue, opts: { full: boolean }) {
    const nm = v.lead_name.trim();
    const program = v.interested_program.trim() || null;
    const base: Record<string, unknown> = {
      lead_name: nm,
      name: nm,
      company_name: v.college_company.trim() || v.company_name.trim() || null,
      phone: v.phone.trim() || null,
      whatsapp: v.whatsapp.trim() || null,
      email: v.email.trim() || null,
      city: v.city.trim() || null,
      industry: v.industry.trim() || null,
      source: v.source.trim() || null,
      service_interest: program || csvServices(v.service_interests) || null,
      interested_program: program,
      requirement: v.main_career_problem.trim() || v.requirement.trim() || null,
      budget: numOrNull(v.budget),
      expected_start_date: v.expected_start_date || null,
      notes: v.notes.trim() || null,
      follow_up_date: v.follow_up_date || null,
      follow_up_time: v.follow_up_time || null,
      follow_up_type: v.follow_up_type || null,
      proposal_status: v.proposal_status || "Not Sent",
      proposal_amount: numOrNull(v.proposal_amount) ?? numOrNull(v.fee_quoted),
      proposal_sent_date: v.proposal_sent_date || null,
      proposal_link: v.proposal_link.trim() || null,
      quotation_link: v.quotation_link.trim() || null,
      agreement_link: v.agreement_link.trim() || null,
      current_profile: v.current_profile.trim() || null,
      degree: v.degree.trim() || null,
      college_company: v.college_company.trim() || null,
      year_of_passing: v.year_of_passing.trim() || null,
      employment_status: v.employment_status.trim() || null,
      current_salary: numOrNull(v.current_salary),
      career_goal: v.career_goal.trim() || null,
      preferred_job_role: v.preferred_job_role.trim() || null,
      target_salary: numOrNull(v.target_salary),
      current_skill_level: v.current_skill_level.trim() || null,
      main_career_problem: v.main_career_problem.trim() || null,
      joining_timeline: v.joining_timeline.trim() || null,
      payment_plan: v.payment_plan.trim() || null,
      parent_approval_required: v.parent_approval_required.trim() || null,
      decision_maker: v.decision_maker.trim() || null,
      preferred_batch: v.preferred_batch.trim() || null,
      laptop_availability: v.laptop_availability.trim() || null,
      lead_stage: v.lead_stage.trim() || null,
      fee_quoted: numOrNull(v.fee_quoted),
      final_fee: numOrNull(v.final_fee),
      payment_status: v.payment_status.trim() || null,
      admission_status: v.admission_status.trim() || null,
    };

    if (!opts.full) {
      // Non-admin: status/priority/follow-up allowed; never change ownership here
      return {
        ...base,
        status: v.status,
        priority: v.priority || "Warm",
      };
    }

    const scoreRaw = Number(v.lead_score);
    return {
      ...base,
      status: v.status,
      priority: v.priority || "Warm",
      lead_score: Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0,
      // Ownership stays with the creator; share work via Assign as Student Lead task.
      assigned_to: currentUserId,
      assigned_by: currentUserId,
    };
  }

  const openCreate = () => {
    if (!canWriteOwnLeads) return;
    setSuccess(null);
    setError(null);
    setEditId(null);
    setForm(emptyForm(currentUserId, isDbAdmin, crmLists));
    setPendingProposalFile(null);
    setProposalFileMeta({
      proposal_file_name: null,
      proposal_file_path: null,
      proposal_file_type: null,
      proposal_file_size: null,
      proposal_uploaded_at: null,
      proposal_link: null,
    });
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!currentUserId) return;
    if (!editId && !canWriteOwnLeads) {
      setError("You cannot create leads.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const fileToUpload = pendingProposalFile;
    const editingId = editId;
    try {
      let saveForm = form;
      if (form.interested_program === NEW_PROGRAM_OPTION) {
        const programName = form.new_program_name.trim();
        if (!programName) throw new Error("Enter a name for the new program.");
        if (isDbAdmin) {
          const updated = await persistInterestedPrograms([...interestedPrograms, programName]);
          setInterestedPrograms(updated);
          setCrmLists((prev) => ({ ...prev, interestedPrograms: updated, serviceCategories: updated }));
        }
        saveForm = { ...form, interested_program: programName, new_program_name: "" };
      }

      if (!isAdmin && editId) {
        if (!String(saveForm.status || "").trim()) {
          throw new Error("Lead status is required before saving.");
        }
        if (!String(saveForm.notes || "").trim()) {
          throw new Error("Remarks are required before saving. Document the call / conversation outcome.");
        }
        if (!String(saveForm.follow_up_date || "").trim()) {
          throw new Error("Next follow-up date is required before saving.");
        }
        const base = buildPayload(saveForm, { full: false }) as Record<string, unknown>;
        const limited = pickEmployeePayload(base);
        const previous = clients.find((cRow) => cRow.id === editId);
        // RLS: assigned lead OR task-linked lead — do not re-filter by assigned_to here
        const up = await supabase.from("clients").update(limited).eq("id", editId);
        if (up.error) throw up.error;

        const prevFollow = String(previous?.follow_up_date ?? "").slice(0, 10);
        const newFollow = String(limited.follow_up_date ?? "").slice(0, 10);
        if (newFollow && newFollow !== prevFollow) {
          await supabase.from("lead_followups").insert({
            client_id: editId,
            follow_up_date: newFollow,
            follow_up_time: limited.follow_up_time ?? null,
            follow_up_type: (limited.follow_up_type as string) || "Call",
            status: "Pending",
            notes: "Updated from lead edit form",
            created_by: currentUserId,
          });
        }

        const prevP = {
          st: String(previous?.proposal_status ?? ""),
          am: previous?.proposal_amount != null ? String(previous.proposal_amount) : "",
          sd: String(previous?.proposal_sent_date ?? "").slice(0, 10),
        };
        const newP = {
          st: String(limited.proposal_status ?? ""),
          am: String(limited.proposal_amount ?? ""),
          sd: String(limited.proposal_sent_date ?? "").slice(0, 10),
        };
        const prevStatus = normalizeStatus(String(previous?.status ?? ""));
        const newStatus = normalizeStatus(String(limited.status ?? ""));
        if (previous && prevStatus !== newStatus) {
          await insertActivityClient(
            supabase,
            editId,
            "Status Changed",
            `${prevStatus || "—"} → ${newStatus}`,
            currentUserId,
          );
        } else if (previous && (prevP.st !== newP.st || prevP.am !== newP.am || prevP.sd !== newP.sd)) {
          await insertActivityClient(
            supabase,
            editId,
            "Proposal Updated",
            `Status ${newP.st}${newP.am ? ` · Amount ₹${Number(newP.am).toLocaleString()}` : ""}`,
            currentUserId,
          );
        } else {
          await insertActivityClient(supabase, editId, "Lead Updated", "Employee saved changes.", currentUserId);
        }
        setSuccess("Lead updated.");
      } else if (editId && isAdmin) {
        const full = buildPayload(saveForm, { full: true }) as Record<string, unknown>;
        const previous = clients.find((cRow) => cRow.id === editId);
        // Keep CRM ownership stable; share work via Assign as Student Lead task.
        full.assigned_to = previous?.assigned_to ?? currentUserId;
        full.assigned_by = previous?.assigned_by ?? currentUserId;
        const up = await supabase.from("clients").update(full).eq("id", editId);
        if (up.error) throw up.error;
        const prevStat = normalizeStatus(String(previous?.status ?? ""));
        const prevAss = previous?.assigned_to ? String(previous.assigned_to) : "";
        const newAss = String(full.assigned_to ?? "");
        const prevProp = {
          st: String(previous?.proposal_status ?? ""),
          am: previous?.proposal_amount != null ? String(previous.proposal_amount) : "",
          sd: String(previous?.proposal_sent_date ?? "").slice(0, 10),
        };
        const newProp = {
          st: form.proposal_status,
          am: form.proposal_amount.trim(),
          sd: form.proposal_sent_date,
        };
        const proposalChanged =
          !!previous &&
          (prevProp.st !== newProp.st || prevProp.am !== newProp.am || prevProp.sd !== newProp.sd);
        const statusChanged = !!previous && prevStat !== form.status.trim();
        const assignedChanged = !!previous && prevAss !== newAss;

        if (statusChanged) {
          await insertActivityClient(
            supabase,
            editId,
            "Status Changed",
            "",
            currentUserId,
            String(previous?.status ?? ""),
            form.status.trim(),
          );
        }
        if (assignedChanged) {
          await insertActivityClient(
            supabase,
            editId,
            "Assigned Person Changed",
            "Lead owner updated.",
            currentUserId,
            prevAss || "Unassigned",
            newAss || "Unassigned",
          );
        }
        if (proposalChanged) {
          await insertActivityClient(
            supabase,
            editId,
            "Proposal Updated",
            `Status ${newProp.st}${newProp.am ? ` · Amount ₹${Number(newProp.am).toLocaleString()}` : ""}`,
            currentUserId,
          );
        }
        if (!statusChanged && !assignedChanged && !proposalChanged) {
          await insertActivityClient(supabase, editId, "Lead Updated", "", currentUserId);
        }
        setSuccess("Lead saved.");
      } else if (!editId && canWriteOwnLeads) {
        const payload = buildPayload(saveForm, { full: true }) as Record<string, unknown>;
        payload.assigned_to = currentUserId;
        payload.assigned_by = currentUserId;
        const inserted = await supabase
          .from("clients")
          .insert(payload)
          .select("id")
          .maybeSingle();

        if (inserted.error) throw inserted.error;
        const nid = inserted.data?.id as string | undefined;
        if (nid) await insertActivityClient(supabase, nid, "Lead Created", `Source ${form.source}`, currentUserId);
        if (nid && fileToUpload) {
          const uploaded = await uploadProposalFile({
            entityType: "student",
            entityId: nid,
            file: fileToUpload,
          });
          setProposalFileMeta((m) => ({ ...m, ...uploaded, proposal_link: m.proposal_link }));
          setPendingProposalFile(null);
        }
        setSuccess(nid && fileToUpload ? "Lead created and proposal uploaded." : "Lead created.");
      }

      if (editingId && fileToUpload) {
        const uploaded = await uploadProposalFile({
          entityType: "student",
          entityId: editingId,
          file: fileToUpload,
        });
        setProposalFileMeta((m) => ({ ...m, ...uploaded, proposal_link: m.proposal_link }));
        setPendingProposalFile(null);
        setSuccess("Lead saved and proposal uploaded.");
      }

      setPanelOpen(false);
      setEditId(null);
      setPendingProposalFile(null);
      await reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!isAdmin || !currentUserId) return;
    if (!confirm("Delete this lead permanently?")) return;
    const { deleted, error: deletionError } = await deleteOwnedClients(supabase, [id], currentUserId, { isAdmin });
    if (deletionError) {
      setError(deletionError);
      return;
    }
    if (!deleted) {
      setError("Could not delete this lead (you can only delete your own Student Master rows). Run AJ_Academy_SB/crm_delete_fix.sql in Supabase if deletes keep failing.");
      return;
    }
    setSuccess("Deleted.");
    await reload();
  };

  const handleBulkDeleteLeads = async () => {
    if (leadBulk.selectedCount === 0 || !currentUserId) return;
    if (!confirm(`Delete ${leadBulk.selectedCount} selected lead(s) permanently?`)) return;
    const ids = [...leadBulk.selected];
    const { deleted, error: deletionError } = await deleteOwnedClients(supabase, ids, currentUserId, { isAdmin });
    if (deletionError) {
      setError(deletionError);
      return;
    }
    if (!deleted) {
      setError("No leads were deleted. You can only delete your own Student Master rows. Run AJ_Academy_SB/crm_delete_fix.sql in Supabase if needed.");
      return;
    }
    leadBulk.clearSelection();
    setSuccess(
      deleted === ids.length
        ? `${deleted} lead(s) deleted.`
        : `${deleted} of ${ids.length} lead(s) deleted (others were not yours).`,
    );
    await reload();
  };

  const handleBulkAssignLeads = async () => {
    if (!isAdmin || leadBulk.selectedCount === 0 || !bulkAssignTo || !currentUserId) return;
    const ids = [...leadBulk.selected];
    const assignee = employeesForSelect.find((e) => e.id === bulkAssignTo);
    const label = assignee?.label || "assignee";
    if (
      !confirm(
        `Assign ${ids.length} lead(s) to ${label} as a Student Lead task?\n\nLeads stay in Student Master for admins. The employee will work them under My Tasks → Student Lead (not as CRM-owned Student Master rows).`,
      )
    ) {
      return;
    }
    const today = todayISO();
    try {
      const resolved = await resolveTaskAssignment(supabase, {
        assigneeId: bulkAssignTo,
        assignmentType: "lead",
        clientIds: ids,
        collegeVisitIds: [],
        projectId: null,
      });

      if (resolved.action === "skip") {
        leadBulk.clearSelection();
        setBulkAssignTo("");
        setSuccess(`${label} already has these lead(s) on an active task.`);
        await reload();
        return;
      }

      let taskId: string;
      if (resolved.action === "merge") {
        const { error: mergeError } = await supabase
          .from("tasks")
          .update({
            client_ids: resolved.clientIds,
            updated_at: new Date().toISOString(),
          })
          .eq("id", resolved.taskId);
        if (mergeError) {
          setError(mergeError.message);
          return;
        }
        taskId = resolved.taskId;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("tasks")
          .insert({
            title: `Student lead outreach (${resolved.clientIds.length} lead${resolved.clientIds.length === 1 ? "" : "s"})`,
            description: `Assigned from Student Master · ${resolved.clientIds.length} linked lead(s).`,
            assigned_to: bulkAssignTo,
            assigned_by: currentUserId,
            assignment_type: "lead",
            client_ids: resolved.clientIds,
            college_visit_ids: [],
            project_id: null,
            priority: "Medium",
            status: "Pending",
            progress: 0,
            start_date: today,
            due_date: null,
          })
          .select("id")
          .single();
        if (insertError) {
          setError(insertError.message);
          return;
        }
        if (!inserted?.id) {
          setError("Task was not created.");
          return;
        }
        taskId = inserted.id;
      }

      try {
        await supabase.rpc("create_task_assignment_notification", { p_task_id: taskId });
      } catch {
        /* optional RPC */
      }
      leadBulk.clearSelection();
      setBulkAssignTo("");
      setSuccess(
        resolved.action === "merge"
          ? `${resolved.addedCount} lead(s) added to ${label}'s existing Student Lead task.${
              resolved.skippedCount ? ` ${resolved.skippedCount} already linked.` : ""
            }`
          : `${resolved.clientIds.length} lead(s) sent to ${label} as a My Tasks → Student Lead assignment (Task Assignment).`,
      );
      await reload();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not assign leads.");
    }
  };

  const leadBulkSelectionProps = !pickForTask
    ? {
        allSelected: leadBulk.allSelected,
        someSelected: leadBulk.someSelected,
        isSelected: leadBulk.isSelected,
        onToggleAll: leadBulk.toggleAll,
        onToggle: leadBulk.toggleOne,
      }
    : undefined;

  const renderLeadBulkBar =
    !pickForTask && leadBulk.selectedCount > 0 ? (
      <BulkSelectionBar
        selectedCount={leadBulk.selectedCount}
        totalCount={leadsForBulk.length}
        onClear={() => {
          leadBulk.clearSelection();
          setBulkAssignTo("");
        }}
        className="mb-3"
      >
        {isAdmin ? (
          <>
            <select
              value={bulkAssignTo}
              onChange={(e) => setBulkAssignTo(e.target.value)}
              className="h-7 rounded-lg border border-[#dbe6f3] bg-white px-2 text-xs text-[#334155]"
            >
              <option value="">Assign as task to…</option>
              {employeesForSelect.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              disabled={!bulkAssignTo}
              className="h-7 rounded-lg bg-[#2563eb] px-3 text-xs text-white hover:bg-[#1d4ed8] disabled:opacity-50"
              onClick={() => void handleBulkAssignLeads()}
            >
              Assign as Student Lead task
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="h-7 rounded-lg bg-rose-600 px-3 text-xs text-white hover:bg-rose-700"
          onClick={() => void handleBulkDeleteLeads()}
        >
          Delete selected
        </Button>
      </BulkSelectionBar>
    ) : null;

  const convertLead = async (leadRow: CrmClientRow) => {
    if (!isAdmin) return;
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .in("status", ["Converted", "Admitted"]);

    const nextCode =
      leadRow.client_code?.trim() || `AJ-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const { error: updateError } = await supabase
      .from("clients")
      .update({
        status: "Admitted",
        admission_status: "Admitted",
        converted_at: new Date().toISOString(),
        client_code: nextCode,
      })
      .eq("id", leadRow.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    try {
      await insertActivityClient(
        supabase,
        leadRow.id,
        "Student Admitted",
        `Assigned student code ${nextCode}`,
        currentUserId,
      );
    } catch (e) {
      logDevSupabase("convertLead.activity", e);
      setError(`Admitted, but timeline log failed: ${friendlyError(e)}`);
    }
    setSuccess("Student admitted.");
    await reload();
  };

  const changePipelineStatus = async (leadRow: CrmClientRow, nextStatus: string) => {
    if (!isAdmin) return;
    const prev = leadRow.status;
    const { error: pipelineError } = await supabase.from("clients").update({ status: nextStatus }).eq("id", leadRow.id);
    if (pipelineError) {
      setError(pipelineError.message);
      return;
    }
    try {
      await insertActivityClient(supabase, leadRow.id, "Status Changed", "", currentUserId, String(prev ?? ""), nextStatus);
    } catch (e) {
      logDevSupabase("changePipelineStatus.activity", e);
      setError(`Status updated, but timeline log failed: ${friendlyError(e)}`);
    }
    await reload();
  };

  const saveFollowQuick = async () => {
    if (!followModalFor?.id?.trim()) {
      setError("Follow-up failed: missing lead.");
      return;
    }
    let actor = currentUserId;
    if (!actor?.trim()) {
      const { data: authData } = await supabase.auth.getUser();
      actor = authData.user?.id ?? "";
      if (!actor) {
        setError("Follow-up failed: sign in again, then retry.");
        return;
      }
      setCurrentUserId(actor);
    }

    const followDate = (followDraft.date || followModalFor.follow_up_date || todayISO()).toString().slice(0, 10);
    if (!isIsoDate(followDate)) {
      setError("Please enter a valid follow-up date (YYYY-MM-DD).");
      return;
    }
    const followTime = normalizeTimeForDb(followDraft.time);
    const followType = (followDraft.type || "Call").trim() || "Call";
    const notesVal = followDraft.notes.trim() || null;

    setSubmitting(true);
    setError(null);
    try {
      const ins = await supabase.from("lead_followups").insert({
        client_id: followModalFor.id,
        follow_up_date: followDate,
        follow_up_time: followTime,
        follow_up_type: followType,
        status: "Pending",
        notes: notesVal,
        created_by: actor,
      });
      if (ins.error) {
        logDevSupabase("lead_followups.insert", ins.error);
        throw new Error(ins.error.message);
      }
      const up = await supabase
        .from("clients")
        .update({
          follow_up_date: followDate,
          follow_up_time: followTime,
          follow_up_type: followType,
        })
        .eq("id", followModalFor.id);
      if (up.error) {
        logDevSupabase("clients.follow_up_snapshot", up.error);
        throw new Error(up.error.message);
      }
      await insertActivityClient(
        supabase,
        followModalFor.id,
        "Follow-up Added",
        notesVal || `Scheduled ${followDate} · ${followType}`,
        actor,
      );
      setFollowModalFor(null);
      setSuccess("Follow-up added.");
      await silentRefreshCrm();
    } catch (e) {
      setError(friendlyError(e));
      logDevSupabase("saveFollowQuick", e);
    } finally {
      setSubmitting(false);
    }
  };

  const markFollowCompleted = async (fr: FollowRow) => {
    if (!currentUserId) return;
    setError(null);
    try {
      const { error: doneError } = await supabase.from("lead_followups").update({ status: "Completed" }).eq("id", fr.id);
      if (doneError) {
        logDevSupabase("lead_followups.complete", doneError);
        throw new Error(doneError.message);
      }
      if (fr.client_id) {
        const patch = await supabase
          .from("clients")
          .update({ last_contacted_at: new Date().toISOString() })
          .eq("id", fr.client_id);
        if (patch.error) logDevSupabase("clients.last_contacted_at", patch.error);
        await insertActivityClient(
          supabase,
          fr.client_id,
          "Follow-up completed",
          fr.notes?.trim() ? fr.notes.trim() : null,
          currentUserId,
        );
      }
      setSuccess("Follow-up marked completed.");
      await silentRefreshCrm();
    } catch (e) {
      setError(friendlyError(e));
      logDevSupabase("markFollowCompleted", e);
    }
  };

  const openProposalModal = (lead: CrmClientRow) => {
    setProposalModalLead(lead);
    setProposalDraft({
      status: ((lead.proposal_status as CrmProposalStatus) || "Not Sent") as CrmProposalStatus,
      amount: lead.proposal_amount != null ? String(lead.proposal_amount) : "",
      sent_date: lead.proposal_sent_date ? String(lead.proposal_sent_date).slice(0, 10) : "",
      proposal_link: String(lead.proposal_link ?? ""),
      quotation_link: String(lead.quotation_link ?? ""),
      agreement_link: String(lead.agreement_link ?? ""),
    });
    setPendingProposalFile(null);
    setProposalFileMeta({
      proposal_file_name: lead.proposal_file_name ?? null,
      proposal_file_path: lead.proposal_file_path ?? null,
      proposal_file_type: lead.proposal_file_type ?? null,
      proposal_file_size: lead.proposal_file_size ?? null,
      proposal_uploaded_at: lead.proposal_uploaded_at ?? null,
      proposal_link: lead.proposal_link ?? null,
    });
  };

  const saveProposalFromModal = async () => {
    if (!proposalModalLead?.id || !currentUserId) return;
    if (!isAdmin) {
      setError("Only admins can update proposals from the tracker.");
      return;
    }
    setProposalSubmitting(true);
    setError(null);
    const fileToUpload = pendingProposalFile;
    try {
      const prev = proposalModalLead;
      const amtRaw = proposalDraft.amount.trim();
      const amt = amtRaw === "" ? null : Number(proposalDraft.amount);
      if (amtRaw !== "" && !Number.isFinite(amt)) {
        setError("Proposal amount must be a valid number.");
        return;
      }
      const updates: Record<string, unknown> = {
        proposal_status: proposalDraft.status,
        proposal_amount: amt,
        proposal_sent_date: proposalDraft.sent_date.trim() || null,
        quotation_link: proposalDraft.quotation_link.trim() || null,
        agreement_link: proposalDraft.agreement_link.trim() || null,
      };

      if (proposalDraft.status === "Accepted" && normalizeStatus(String(prev.status)) !== "Converted") {
        const year = new Date().getFullYear();
        const { count } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "Converted");
        const nextCode = (typeof prev.client_code === "string" && prev.client_code.trim())
          ? prev.client_code.trim()
          : `BB-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
        updates.status = "Converted";
        updates.converted_at = new Date().toISOString();
        if (!(typeof prev.client_code === "string" && prev.client_code.trim())) {
          updates.client_code = nextCode;
        }
      }

      const { error: upErr } = await supabase.from("clients").update(updates).eq("id", prev.id);
      if (upErr) {
        logDevSupabase("clients.proposal_update", upErr);
        throw new Error(upErr.message);
      }

      const noteLine = `Status: ${proposalDraft.status}${amt != null ? ` · Amount: ₹${Number(amt).toLocaleString()}` : ""}`;
      await insertActivityClient(supabase, prev.id, "Proposal Updated", noteLine, currentUserId);

      if (fileToUpload) {
        await uploadProposalFile({
          entityType: "student",
          entityId: prev.id,
          file: fileToUpload,
        });
        setPendingProposalFile(null);
      }

      if (proposalDraft.status === "Accepted" && normalizeStatus(String(prev.status)) !== "Converted") {
        await insertActivityClient(
          supabase,
          prev.id,
          "Converted to Client",
          "Proposal accepted — lead marked converted.",
          currentUserId,
        );
      }

      setProposalModalLead(null);
      setSuccess(fileToUpload ? "Proposal saved and file uploaded." : "Proposal saved.");
      await silentRefreshCrm();
    } catch (e) {
      setError(friendlyError(e));
      logDevSupabase("saveProposalFromModal", e);
    } finally {
      setProposalSubmitting(false);
    }
  };

  const todayFollowUps = followRowsFiltered.filter((f) => f.follow_up_date === todayISO());

  const handleDownloadStudentTemplate = () => {
    downloadStudentMasterImportTemplate();
    setSuccess("Import template downloaded (headers match Meta CRM Import / All Students table).");
  };

  const handleExportStudents = () => {
    if (!rowsForExport.length) {
      setError("No rows match the current filters to export.");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    const filename =
      leadBulk.selectedCount > 0
        ? `student-master-selected-${date}.csv`
        : filtersActive
          ? `student-master-filtered-${date}.csv`
          : `student-master-${date}.csv`;
    exportStudentMasterCsv(rowsForExport, employeeNameMap, filename);
    setSuccess(
      leadBulk.selectedCount > 0
        ? `Exported ${rowsForExport.length} selected student row(s).`
        : filtersActive
          ? `Exported ${rowsForExport.length} filtered student row(s) (of ${clients.length} total).`
          : `Exported all ${rowsForExport.length} student row(s).`,
    );
  };

  const handleImportStudents = async (file: File) => {
    if (!currentUserId || !canWriteOwnLeads) return;
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const matrix = await studentMasterFileToMatrix(file);
      const { payloads, errors } = parseStudentMasterMatrix(matrix, {
        counsellors: employeesForSelect,
        currentUserId,
        isDbAdmin,
      });
      let ok = 0;
      let fail = errors.length;
      const rowErrors = [...errors];

      // Bulk insert for speed; if a chunk fails, fall back to row-by-row
      // to keep detailed row-level failure reporting.
      const chunkSize = 150;
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const chunk = payloads.slice(i, i + chunkSize);
        const { error: chunkError } = await supabase.from("clients").insert(chunk);
        if (!chunkError) {
          ok += chunk.length;
          continue;
        }

        for (const payload of chunk) {
          const { error: insertError } = await supabase.from("clients").insert(payload);
          if (insertError) {
            fail += 1;
            rowErrors.push(insertError.message);
          } else {
            ok += 1;
          }
        }
      }

      await reload();
      setSuccess(
        `Import complete: ${ok} added, ${fail} failed.${rowErrors.length ? ` ${rowErrors.slice(0, 3).join(" ")}` : ""}`,
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Student Master</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {isAdmin
              ? "Track every employee's student leads. Use the Owner / Assignee filter to review one person. Employees only see their own leads."
              : "Your assigned student leads only — counselling follow-ups, fees and admissions."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void reload()}
            className="h-9 rounded-full border-[#e8dcc8] bg-[#f8fbff]"
          >
            Refresh
          </Button>
          {canWriteOwnLeads ? (
            <Button data-requires-online onClick={openCreate} className="h-9 rounded-full bg-[#c9a227] px-5 text-white hover:bg-[#b8921f]">
              + Add Student
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Banner tone="error" message={error} /> : null}
      {success ? <Banner tone="success" message={success} /> : null}

      <LeadCallLiveDashboard stats={callLiveStats} live={callLiveRows} isAdmin={isAdmin} />

      {!hidePendingBanner ? (
        <PendingCallOutcomeBanner
          sessions={pendingCallSessions}
          onUpdate={(session) => setCallOutcomeSession(session)}
          onDismiss={() => setHidePendingBanner(true)}
        />
      ) : null}

      {pickForTask ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c9a227] bg-[#fef3c7] px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-[#92400e]">Selecting leads for task assignment</p>
            <p className="text-xs text-[#78350f]">
              Tab: {tabLabels[activeTab]} | {pickedLeadIds.size} selected | use All Leads filters below
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => router.push(decodeURIComponent(returnTo))}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!pickedLeadIds.size}
              className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f] disabled:opacity-50"
              onClick={confirmLeadPick}
            >
              Confirm {pickedLeadIds.size ? `${pickedLeadIds.size} lead(s)` : "selection"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {visibleTabIds.map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={
                activeTab === tabId
                  ? "rounded-xl bg-[#c9a227] px-3 py-2 text-sm font-semibold text-white shadow-md"
                  : "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-[#eaf1ff]"
              }
            >
              {tabLabels[tabId]}
            </button>
          ))}
        </div>
      </div>

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] px-4 py-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-[#64748b]" htmlFor="sm-employee-tracker">
            Employee
          </label>
          <select
            id="sm-employee-tracker"
            className="h-9 min-w-[12rem] rounded-lg border border-[#dbe6f3] bg-white px-3 text-sm text-[#334155]"
            value={fltAssigned}
            onChange={(e) => setFltAssigned(e.target.value)}
          >
            <option value="">All employees</option>
            {employeesForSelect.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          {fltAssigned ? (
            <>
              <span className="text-xs text-[#64748b]">
                Showing leads &amp; activity for{" "}
                <strong className="text-[#0f172a]">{employeeNameMap[fltAssigned] || "selected employee"}</strong>
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-full border-[#e8dcc8] px-3 text-xs"
                onClick={() => setFltAssigned("")}
              >
                Show all
              </Button>
            </>
          ) : (
            <span className="text-xs text-[#64748b]">Showing every employee&apos;s leads (select one to track activity).</span>
          )}
        </div>
      ) : null}

      {activeTab === "overview" && (
        <>
          <div className="stat-cards-grid-5">
            <LeadSummaryCard title="Total Leads" value={overview.total} loading={loading} />
            <LeadSummaryCard title="New Leads" value={overview.newLeads} loading={loading} />
            <LeadSummaryCard title="Contacted" value={overview.contacted} loading={loading} />
            <LeadSummaryCard title="Interested" value={overview.interested} loading={loading} />
            <LeadSummaryCard title="Fee Discussed" value={overview.proposalSent} loading={loading} />
            <LeadSummaryCard title="Admitted Students" value={overview.converted} loading={loading} />
            <LeadSummaryCard title="Lost" value={overview.lost} loading={loading} />
            <LeadSummaryCard title="Follow-ups Today" value={overview.followToday} loading={loading} />
            <LeadSummaryCard title="Overdue Follow-ups" value={overview.overdue} loading={loading} accent="rose" />
            {isAdmin ? (
              <LeadSummaryCard
                title="Revenue Potential"
                value={overview.revenuePotential ? `₹ ${overview.revenuePotential.toLocaleString()}` : "₹ 0"}
                loading={loading}
              />
            ) : (
              <LeadSummaryCard title="Your pipeline snapshot" value="—" loading={loading} />
            )}
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <BarBlock title="Lead source breakdown" entries={overviewCharts.sources} />
            <BarBlock title="Pipeline statuses" entries={overviewCharts.pipe} accent="sky" />
            <BarBlock title="Monthly creations" entries={overviewCharts.months} accent="purple" />
          </div>
        </>
      )}

      {activeTab === "all-leads" ? (
        <div className="space-y-3">
          {!pickForTask ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full border-[#e8dcc8] bg-[#f8fbff]"
                onClick={handleDownloadStudentTemplate}
              >
                <FileText className="mr-1 h-4 w-4" />
                Import template
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportStudents(f);
                }}
              />
              {canWriteOwnLeads ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full border-[#e8dcc8] bg-[#f8fbff]"
                  disabled={importing}
                  onClick={() => importFileRef.current?.click()}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  {importing ? "Importing…" : "Import"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full border-[#e8dcc8] bg-[#f8fbff]"
                disabled={!rowsForExport.length}
                onClick={handleExportStudents}
                title={
                  leadBulk.selectedCount > 0
                    ? "Export selected rows"
                    : filtersActive
                      ? "Export rows matching current table filters"
                      : "Export all rows in All Students"
                }
              >
                <Download className="mr-1 h-4 w-4" />
                {leadBulk.selectedCount > 0
                  ? `Export selected (${rowsForExport.length})`
                  : filtersActive
                    ? `Export filtered (${rowsForExport.length})`
                    : `Export${rowsForExport.length ? ` (${rowsForExport.length})` : ""}`}
              </Button>
            </div>
          ) : null}
          {renderLeadBulkBar}
          <TableSearchBar
            value={searchText}
            onChange={setSearchText}
            placeholder="Search name, email, phone, city…"
            showClear={filtersActive}
            onClear={clearTableFilters}
            hint={`Showing ${paginatedClients.length} of ${filteredClients.length} student(s) · page ${leadsPage}/${leadsTotalPages}`}
          />
          <AllLeadsTable
            loading={loading}
            leads={paginatedClients}
            pickMode={pickForTask}
            pickedIds={pickedLeadIds}
            onTogglePick={togglePickLead}
            employeeNameMap={employeeNameMap}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            fltSource={fltSource}
            setFltSource={setFltSource}
            fltProgram={fltProgram}
            setFltProgram={setFltProgram}
            fltDegree={fltDegree}
            setFltDegree={setFltDegree}
            degreeOptions={degreeOptions}
            fltStatus={fltStatus}
            setFltStatus={setFltStatus}
            fltPriority={fltPriority}
            setFltPriority={setFltPriority}
            fltAssigned={fltAssigned}
            setFltAssigned={setFltAssigned}
            fltStage={fltStage}
            setFltStage={setFltStage}
            fltPaymentStatus={fltPaymentStatus}
            setFltPaymentStatus={setFltPaymentStatus}
            fltAdmissionStatus={fltAdmissionStatus}
            setFltAdmissionStatus={setFltAdmissionStatus}
            programOptions={interestedPrograms}
            sourceOptions={crmLists.leadSources}
            statusOptions={crmLists.leadStatuses}
            priorityOptions={crmLists.priorityTypes}
            employeeOptions={employeesForSelect}
            canContactLead={canContactLead}
            canEditLead={canEditLead}
            onPhoneClick={(lead) => void handlePhoneClick(lead)}
            onWhatsAppClick={(lead) => openWhatsAppCompose(lead)}
            onEmailClick={(lead) => openEmailCompose(lead)}
            onOpenActivity={(lead) => void openActivityForLead(lead)}
            onProfile={setProfileLead}
            onEdit={(leadRecord) => {
              setSuccess(null);
              setError(null);
              setEditId(leadRecord.id);
              setForm(rowToForm(leadRecord));
              setPendingProposalFile(null);
              setProposalFileMeta({
                proposal_file_name: leadRecord.proposal_file_name ?? null,
                proposal_file_path: leadRecord.proposal_file_path ?? null,
                proposal_file_type: leadRecord.proposal_file_type ?? null,
                proposal_file_size: leadRecord.proposal_file_size ?? null,
                proposal_uploaded_at: leadRecord.proposal_uploaded_at ?? null,
                proposal_link: leadRecord.proposal_link ?? null,
              });
              setPanelOpen(true);
            }}
            onDelete={(id: string) => void handleDeleteLead(id)}
            onAddFollow={(leadRecord: CrmClientRow) => {
              setFollowModalFor(leadRecord);
              setFollowDraft({
                date: leadRecord.follow_up_date || todayISO(),
                time: String(leadRecord.follow_up_time || ""),
                type: String(leadRecord.follow_up_type || "Call"),
                notes: "",
              });
            }}
            onConvert={(leadRecord) => void convertLead(leadRecord)}
            bulkSelection={leadBulkSelectionProps}
            pagination={{
              page: leadsPage,
              totalPages: leadsTotalPages,
              totalItems: leadsTotalItems,
              pageSize: leadsPageSize,
              onPageChange: setLeadsPage,
              onPageSizeChange: setLeadsPageSize,
            }}
          />
        </div>
      ) : null}

      {["follow-ups", "pipeline", "converted", "proposal"].includes(activeTab) ? (
        <TableSearchBar
          value={searchText}
          onChange={setSearchText}
          placeholder="Search name, email, phone, company..."
          showClear={filtersActive}
          onClear={clearTableFilters}
          hint={`Showing ${filteredClients.length} of ${clients.length} lead(s) | use All Leads tab for column filters`}
        />
      ) : null}

      {activeTab === "follow-ups" && (
        <>
          <div className="stat-cards-grid">
            <LeadSummaryCard title="Today" value={todayFollowUps.length} loading={loading} />
            <LeadSummaryCard title="Overdue snapshot" value={overview.overdue} loading={loading} accent="rose" />
            <LeadSummaryCard title="Rows tracked" value={followRowsFiltered.length} loading={loading} />
            <LeadSummaryCard
              title="Completed"
              value={followRowsFiltered.filter((followRowEntry) => followRowEntry.status === "Completed").length}
              loading={loading}
            />
          </div>
          <FollowUpsTable
            rows={followRowsFiltered}
            clientMap={clientMapFiltered}
            employeeNameMap={employeeNameMap}
            canEditLead={canEditLead}
            onComplete={(fr) => void markFollowCompleted(fr)}
          />
        </>
      )}

      {activeTab === "pipeline" && (
        <PipelineBoard
          leads={filteredClients}
          isAdmin={canWriteOwnLeads}
          statusOptions={crmLists.leadStatuses}
          onChangeStatus={(r, ns) => void changePipelineStatus(r, ns)}
        />
      )}

      {activeTab === "converted" && (
        <>
          {renderLeadBulkBar}
        <ConvertedTable
          leads={filteredClients}
          employeeNameMap={employeeNameMap}
          isAdmin={isAdmin}
          onProfile={setProfileLead}
          bulkSelection={leadBulkSelectionProps}
        />
        </>
      )}

      {activeTab === "proposal" && (
        <>
          {renderLeadBulkBar}
          <p className="text-sm text-[#64748b]">
            Track proposal status and upload PDF/DOC files. Changes save to the lead and appear in Activity Timeline.
          </p>
          <ProposalTrackerTable leads={filteredClients} isAdmin={canWriteOwnLeads} onEdit={(leadRow) => openProposalModal(leadRow)} bulkSelection={leadBulkSelectionProps} />
          {proposalModalLead ? (
            <ProposalEditModal
              lead={proposalModalLead}
              draft={proposalDraft}
              setDraft={setProposalDraft}
              submitting={proposalSubmitting}
              onClose={() => {
                setProposalModalLead(null);
                setPendingProposalFile(null);
              }}
              onSave={() => void saveProposalFromModal()}
              proposalFileMeta={proposalFileMeta}
              pendingProposalFile={pendingProposalFile}
              onPendingFileChange={setPendingProposalFile}
              onProposalMetaChange={setProposalFileMeta}
              onUploadError={setError}
              onUploadSuccess={setSuccess}
            />
          ) : null}
        </>
      )}

      {activeTab === "timeline" && (
        <ActivityTable rows={activityRowsFiltered} clientMap={clientMapFiltered} employeeNameMap={employeeNameMap} loading={loading} />
      )}

      {activeTab === "reports" && isDbAdmin ? (
        <ReportsPanel
          leads={filteredClients}
          followRows={followRowsFiltered}
          isAdmin={isAdmin}
          employeeNameMap={employeeNameMap}
        />
      ) : null}

      {activeTab === "settings" && isDbAdmin ? (
        <CrmSettingsPanel
          lists={crmLists}
          onSaved={(next) => {
            setCrmLists(next);
            setInterestedPrograms(next.interestedPrograms);
            setSuccess("CRM settings saved. Dropdowns and pipeline columns updated.");
          }}
          onError={setError}
        />
      ) : null}

      {panelOpen && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setPanelOpen(false)} />
          <div className="fixed inset-0 z-50 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[540px] lg:max-w-[100vw]">
            <StudentLeadFormPanel
              title={editId ? (isAdmin ? "Edit student" : "Update student") : "Add student"}
              open={panelOpen}
              value={form}
              programOptions={interestedPrograms}
              sourceOptions={crmLists.leadSources}
              statusOptions={crmLists.leadStatuses}
              priorityOptions={crmLists.priorityTypes}
              followUpTypeOptions={crmLists.followUpTypes}
              employees={employeesForSelect}
              canAssign={false}
              submitting={submitting}
              onChange={setForm}
              onClose={() => setPanelOpen(false)}
              onSubmit={() => void handleSave()}
              proposalUploadSlot={
                <ProposalFileUpload
                  entityType="student"
                  entityId={editId}
                  meta={proposalFileMeta}
                  pendingFile={pendingProposalFile}
                  onPendingFileChange={setPendingProposalFile}
                  onMetaChange={setProposalFileMeta}
                  disabled={submitting}
                  onError={setError}
                  onSuccess={setSuccess}
                />
              }
            />
          </div>
        </>
      )}

      {profileLead ? (
        <ProfileModal lead={profileLead} onClose={() => setProfileLead(null)} employeeMap={employeeNameMap} follows={followRows.filter((followRowRecord) => followRowRecord.client_id === profileLead.id)} activities={activityRows.filter((aRow) => aRow.client_id === profileLead.id)} />
      ) : null}

      {followModalFor ? (
        <QuickFollowModal
          draft={followDraft}
          setDraft={setFollowDraft}
          submitting={submitting}
          target={followModalFor}
          followUpTypes={crmLists.followUpTypes}
          onClose={() => setFollowModalFor(null)}
          onSave={() => void saveFollowQuick()}
        />
      ) : null}

      {whatsAppComposeLead ? (
        <WhatsAppComposeModal
          open={Boolean(whatsAppComposeLead)}
          leadName={displayLeadName(whatsAppComposeLead)}
          phone={String(whatsAppComposeLead.whatsapp || whatsAppComposeLead.phone || "")}
          templates={whatsAppTemplates}
          submitting={whatsAppSubmitting}
          onClose={() => {
            if (!whatsAppSubmitting) setWhatsAppComposeLead(null);
          }}
          onSend={(message) => void handleWhatsAppSend(message)}
        />
      ) : null}

      {emailComposeLead ? (
        <EmailComposeModal
          open={Boolean(emailComposeLead)}
          leadName={displayLeadName(emailComposeLead)}
          email={String(emailComposeLead.email || "")}
          templates={emailTemplates}
          submitting={emailSubmitting}
          onClose={() => {
            if (!emailSubmitting) setEmailComposeLead(null);
          }}
          onSend={(message) => void handleEmailSend(message)}
        />
      ) : null}

      <LeadActivityModal
        open={Boolean(activityModalLead)}
        title={activityModalLead ? `Activity — ${displayLeadName(activityModalLead)}` : "Activity"}
        loading={activityModalLoading}
        activities={activityModalRows}
        employeeNameMap={employeeNameMap}
        onClose={() => setActivityModalLead(null)}
      />

      <CallOutcomeModal
        open={Boolean(callOutcomeSession)}
        session={callOutcomeSession}
        leadName={
          callOutcomeSession
            ? callOutcomeSession.lead_name ||
              displayLeadName(clients.find((c) => c.id === callOutcomeSession.lead_id) || ({} as CrmClientRow)) ||
              "Lead"
            : "Lead"
        }
        currentStatus={clients.find((c) => c.id === callOutcomeSession?.lead_id)?.status}
        currentStage={clients.find((c) => c.id === callOutcomeSession?.lead_id)?.lead_stage}
        currentPriority={clients.find((c) => c.id === callOutcomeSession?.lead_id)?.priority}
        assignedEmployeeId={clients.find((c) => c.id === callOutcomeSession?.lead_id)?.assigned_to}
        employeeOptions={employeesForSelect}
        submitting={callOutcomeSubmitting}
        onClose={() => setCallOutcomeSession(null)}
        onSubmit={submitCallOutcome}
      />
    </section>
  );
}

function Banner({ tone, message }: { tone: "error" | "success"; message: string }) {
  const styles =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-xl border px-4 py-2 text-sm ${styles}`}>{message}</div>;
}

function BarBlock({
  title,
  entries,
  accent = "blue",
}: {
  title: string;
  entries: [string, number][];
  accent?: "blue" | "sky" | "purple";
}) {
  const maxVal = Math.max(1, ...entries.map((entry) => entry[1]));
  const barTone =
    accent === "sky"
      ? "bg-sky-500"
      : accent === "purple"
        ? "bg-purple-500"
        : "bg-[#c9a227]";
  return (
    <div className="rounded-[18px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#64748b]">{title}</p>
      <div className="space-y-3">
        {entries.length === 0 ? <p className="text-sm text-slate-400">No data.</p> : null}
        {entries.slice(0, 8).map(([label, value]) => (
          <div key={label}>
            <div className="flex items-center justify-between text-xs font-medium text-slate-700">
              <span className="truncate pr-2">{label}</span>
              <span>{value}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-2 ${barTone} rounded-full`} style={{ width: `${Math.max(6, (value / maxVal) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowUpsTable({
  rows,
  clientMap,
  employeeNameMap,
  canEditLead,
  onComplete,
}: {
  rows: FollowRow[];
  clientMap: Record<string, CrmClientRow>;
  employeeNameMap: Record<string, string>;
  canEditLead: (l: CrmClientRow) => boolean;
  onComplete: (r: FollowRow) => void;
}) {
  const visibleRows = rows.filter((fr) => clientMap[fr.client_id]);
  return (
    <ResponsiveDataView
      desktop={
        <div className="responsive-table-wrap rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-[#f1f6fc] text-[#64748b]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Lead</th>
                <th className="px-3 py-2 text-left">Company</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8edf5]">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-[#64748b]">
                    No follow-ups for the current filters. Add one from All Leads, or adjust search / Owner filter on All Leads.
                  </td>
                </tr>
              ) : null}
              {visibleRows.map((fr) => {
                const cli = clientMap[fr.client_id];
                if (!cli) return null;
                const canTouch = canEditLead(cli);
                return (
                  <tr key={fr.id}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{displayLeadName(cli)}</td>
                    <td className="max-w-[180px] truncate px-3 py-2">{cli.company_name || "-"}</td>
                    <td>{cli.assigned_to ? employeeNameMap[cli.assigned_to] ?? "-" : "-"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDisplayDate(fr.follow_up_date)}</td>
                    <td className="whitespace-nowrap">{fr.follow_up_time || "-"}</td>
                    <td>{fr.follow_up_type || "-"}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-slate-600">{fr.notes || "-"}</td>
                    <td>{fr.status || "Pending"}</td>
                    <td className="px-3 py-2 text-right">
                      {canTouch && fr.status !== "Completed" ? (
                        <button type="button" className="text-xs font-semibold text-emerald-600 hover:underline" onClick={() => onComplete(fr)}>
                          Done
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }
      mobile={
        visibleRows.length === 0 ? (
          <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
            No follow-ups for the current filters. Add one from All Leads, or adjust search / Owner filter on All Leads.
          </p>
        ) : (
          visibleRows.map((fr) => {
            const cli = clientMap[fr.client_id];
            const canTouch = canEditLead(cli);
            return (
              <MobileRecordCard
                key={fr.id}
                title={displayLeadName(cli)}
                subtitle={cli.company_name || undefined}
                previewFields={[
                  { label: "Date", value: formatDisplayDate(fr.follow_up_date) || "-" },
                  { label: "Type", value: fr.follow_up_type || "-" },
                  { label: "Status", value: fr.status || "Pending" },
                  { label: "Owner", value: cli.assigned_to ? employeeNameMap[cli.assigned_to] ?? "-" : "-" },
                ]}
                detailFields={[
                  { label: "Lead", value: displayLeadName(cli) },
                  { label: "Company", value: cli.company_name || "-" },
                  { label: "Owner", value: cli.assigned_to ? employeeNameMap[cli.assigned_to] ?? "-" : "-" },
                  { label: "Date", value: formatDisplayDate(fr.follow_up_date) || "-" },
                  { label: "Time", value: fr.follow_up_time || "-" },
                  { label: "Type", value: fr.follow_up_type || "-" },
                  { label: "Status", value: fr.status || "Pending" },
                  { label: "Notes", value: fr.notes || "-", clamp: true },
                ]}
                primaryActions={
                  canTouch && fr.status !== "Completed"
                    ? [{ label: "Done", onClick: () => onComplete(fr) }]
                    : []
                }
              />
            );
          })
        )
      }
    />
  );
}

function PipelineBoard({
  leads,
  isAdmin,
  statusOptions,
  onChangeStatus,
}: {
  leads: CrmClientRow[];
  isAdmin: boolean;
  statusOptions: readonly string[];
  onChangeStatus: (r: CrmClientRow, s: string) => void;
}) {
  const statuses = statusOptions.length ? statusOptions : CRM_LEAD_STATUSES;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex h-[min(70vh,720px)] min-h-[360px] min-w-[980px] gap-3">
        {statuses.map((statusCol) => {
          const colLeads = leads.filter((l) => normalizeStatus(String(l.status)) === statusCol);
          return (
            <div
              key={statusCol}
              className="flex min-h-0 min-w-[240px] flex-1 flex-col rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-3"
            >
              <p className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-wide text-[#475569]">
                {statusCol} · {colLeads.length}
              </p>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                {colLeads.length === 0 ? (
                  <p className="px-1 text-xs text-[#94a3b8]">No leads in this stage.</p>
                ) : null}
                {colLeads.map((card) => (
                  <div key={card.id} className="rounded-xl border border-white bg-white p-3 shadow-sm">
                    <p className="font-semibold text-slate-900">{displayLeadName(card)}</p>
                    <p className="text-xs text-slate-500">{card.company_name || ""}</p>
                    <div className="mt-2 space-y-1 text-xs text-slate-700">
                      {card.budget != null ? <p>Budget ₹{Number(card.budget).toLocaleString()}</p> : null}
                      <p>Priority {String(card.priority || "—")}</p>
                      <p className="truncate">Follow-up {formatDisplayDate(card.follow_up_date)}</p>
                    </div>
                    {isAdmin ? (
                      <select
                        className="mt-2 h-8 w-full rounded-lg border border-[#dbe6f3] px-2 text-xs"
                        value={normalizeStatus(String(card.status))}
                        onChange={(e) => onChangeStatus(card, e.target.value)}
                      >
                        {statuses.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeOutreachBadge({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        done ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
      ].join(" ")}
      title={done ? `${label} completed by employee` : `${label} not done yet`}
    >
      {done ? "Done" : "Pending"}
    </span>
  );
}

function AllLeadsTable({
  loading,
  leads,
  pickMode = false,
  pickedIds,
  onTogglePick,
  employeeNameMap,
  isAdmin,
  currentUserId,
  programOptions,
  sourceOptions,
  statusOptions,
  priorityOptions,
  fltSource,
  setFltSource,
  fltProgram,
  setFltProgram,
  fltDegree,
  setFltDegree,
  degreeOptions,
  fltStatus,
  setFltStatus,
  fltPriority,
  setFltPriority,
  fltAssigned,
  setFltAssigned,
  fltStage,
  setFltStage,
  fltPaymentStatus,
  setFltPaymentStatus,
  fltAdmissionStatus,
  setFltAdmissionStatus,
  employeeOptions,
  canContactLead,
  canEditLead,
  onPhoneClick,
  onWhatsAppClick,
  onEmailClick,
  onOpenActivity,
  onProfile,
  onEdit,
  onDelete,
  onAddFollow,
  onConvert,
  pagination,
  bulkSelection,
}: {
  loading: boolean;
  leads: CrmClientRow[];
  pickMode?: boolean;
  pickedIds?: Set<string>;
  onTogglePick?: (id: string) => void;
  employeeNameMap: Record<string, string>;
  isAdmin: boolean;
  currentUserId: string;
  programOptions: string[];
  sourceOptions: readonly string[];
  statusOptions: readonly string[];
  priorityOptions: readonly string[];
  fltSource: string;
  setFltSource: (s: string) => void;
  fltProgram: string;
  setFltProgram: (s: string) => void;
  fltDegree: string;
  setFltDegree: (s: string) => void;
  degreeOptions: string[];
  fltStatus: string;
  setFltStatus: (s: string) => void;
  fltPriority: string;
  setFltPriority: (s: string) => void;
  fltAssigned: string;
  setFltAssigned: (s: string) => void;
  fltStage: string;
  setFltStage: (s: string) => void;
  fltPaymentStatus: string;
  setFltPaymentStatus: (s: string) => void;
  fltAdmissionStatus: string;
  setFltAdmissionStatus: (s: string) => void;
  employeeOptions: { id: string; label: string }[];
  canContactLead: (l: CrmClientRow) => boolean;
  canEditLead: (l: CrmClientRow) => boolean;
  onPhoneClick: (l: CrmClientRow) => void;
  onWhatsAppClick: (l: CrmClientRow) => void;
  onEmailClick: (l: CrmClientRow) => void;
  onOpenActivity: (l: CrmClientRow) => void;
  onProfile: (l: CrmClientRow) => void;
  onEdit: (l: CrmClientRow) => void;
  onDelete: (id: string) => void;
  onAddFollow: (l: CrmClientRow) => void;
  onConvert: (l: CrmClientRow) => void;
  pagination?: {
    page: number;
    totalPages: number;
    totalItems: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
  bulkSelection?: {
    allSelected: boolean;
    someSelected: boolean;
    isSelected: (id: string) => boolean;
    onToggleAll: () => void;
    onToggle: (id: string) => void;
  };
}) {
  const today = todayISO();
  const showBulk = Boolean(bulkSelection) && !pickMode;
  const colCount = (pickMode ? 1 : 0) + (showBulk ? 1 : 0) + STUDENT_MASTER_DATA_COLUMN_COUNT + 1;
  const thCls = "px-4 py-3 text-center align-middle min-w-[9rem]";
  const tdCls = "whitespace-nowrap px-4 py-3 text-center align-middle";
  const tdTrunc = "max-w-[160px] truncate px-4 py-3 text-center align-middle";
  const dash = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <ResponsiveDataView
        selectAll={
          showBulk
            ? {
                checked: bulkSelection!.allSelected,
                indeterminate: bulkSelection!.someSelected,
                onChange: bulkSelection!.onToggleAll,
                label: "Select all",
              }
            : undefined
        }
        desktop={
          <div className="responsive-table-wrap">
            <table
              className="table-freeze-cols w-full min-w-[5200px] text-sm"
              style={
                {
                  ["--sticky-col-2" as string]: "14rem",
                  ["--sticky-check-w" as string]: "2.75rem",
                } as CSSProperties
              }
            >
              <thead className="bg-[#f1f6fc] text-[#64748b]">
                <tr>
                  {pickMode ? <TableHeaderCell label="Pick" className={TABLE_CHECK_TH} /> : null}
                  {showBulk ? (
                    <th className={TABLE_CHECK_TH}>
                      <div className="flex justify-center">
                        <TableBulkCheckbox
                          checked={bulkSelection!.allSelected}
                          indeterminate={bulkSelection!.someSelected}
                          disabled={!leads.length}
                          onChange={bulkSelection!.onToggleAll}
                          ariaLabel="Select all leads"
                        />
                      </div>
                    </th>
                  ) : null}
                  <TableHeaderCell
                    label="Student Name"
                    className={`${thCls} sticky-col ${
                      pickMode || showBulk ? "sticky-col-after-check" : "sticky-col-1"
                    } min-w-[14rem]`}
                  />
                  <TableHeaderCell
                    label="Mobile Number"
                    className={`${thCls} min-w-[11rem] ${
                      pickMode || showBulk ? "" : "sticky-col sticky-col-2"
                    }`}
                  />
                  <TableHeaderCell label="WhatsApp Number" className={thCls} />
                  <TableHeaderCell label="Email" className={thCls} />
                  <TableHeaderCell label="City" className={thCls} />
                  <TableHeaderCell label="Current Profile" className={thCls} />
                  <TableHeaderFilter
                    label="Degree"
                    value={fltDegree}
                    onChange={setFltDegree}
                    options={degreeOptions.map((d) => ({ value: d, label: d }))}
                    allLabel="All degrees"
                    className={thCls}
                  />
                  <TableHeaderCell label="College/Company" className={thCls} />
                  <TableHeaderCell label="Year of Passing" className={thCls} />
                  <TableHeaderCell label="Employment Status" className={thCls} />
                  <TableHeaderCell label="Current Salary" className={thCls} />
                  <TableHeaderFilter
                    label="Interested Program"
                    value={fltProgram}
                    onChange={setFltProgram}
                    options={programOptions.map((s) => ({ value: s, label: s }))}
                    allLabel="All programs"
                    className={thCls}
                  />
                  <TableHeaderCell label="Career Goal" className={thCls} />
                  <TableHeaderCell label="Preferred Job Role" className={thCls} />
                  <TableHeaderCell label="Target Salary" className={thCls} />
                  <TableHeaderCell label="Current Skill Level" className={thCls} />
                  <TableHeaderCell label="Main Career Problem" className={thCls} />
                  <TableHeaderCell label="Joining Timeline" className={thCls} />
                  <TableHeaderCell label="Program Budget" className={thCls} />
                  <TableHeaderCell label="Full Payment or Instalment" className={thCls} />
                  <TableHeaderCell label="Parent Approval Required" className={thCls} />
                  <TableHeaderCell label="Decision Maker" className={thCls} />
                  <TableHeaderCell label="Preferred Batch" className={thCls} />
                  <TableHeaderCell label="Laptop Availability" className={thCls} />
                  <TableHeaderFilter
                    label="Lead Source"
                    value={fltSource}
                    onChange={setFltSource}
                    options={(sourceOptions.length ? sourceOptions : CRM_SOURCES).map((s) => ({ value: s, label: s }))}
                    allLabel="All sources"
                    className={thCls}
                  />
                  <TableHeaderFilter
                    label="Assigned Counsellor"
                    value={fltAssigned}
                    onChange={setFltAssigned}
                    options={employeeOptions.map((e) => ({ value: e.id, label: e.label }))}
                    allLabel="All employees"
                    disabled={!isAdmin}
                    className={thCls}
                  />
                  <TableHeaderFilter
                    label="Lead Stage"
                    value={fltStage}
                    onChange={setFltStage}
                    options={LEAD_STAGES.map((s) => ({ value: s, label: s }))}
                    allLabel="All stages"
                    className={thCls}
                  />
                  <TableHeaderFilter
                    label="Lead Status"
                    value={fltStatus}
                    onChange={setFltStatus}
                    options={(statusOptions.length ? statusOptions : CRM_LEAD_STATUSES).map((s) => ({ value: s, label: s }))}
                    allLabel="All statuses"
                    className={thCls}
                  />
                  <TableHeaderFilter
                    label="Priority"
                    value={fltPriority}
                    onChange={setFltPriority}
                    options={(priorityOptions.length ? priorityOptions : CRM_PRIORITIES).map((p) => ({ value: p, label: p }))}
                    allLabel="All priorities"
                    className={thCls}
                  />
                  <TableHeaderCell label="Primary Objection" className={thCls} />
                  <TableHeaderCell label="Next Follow-up Date" className={thCls} />
                  <TableHeaderCell label="Fee Quoted" className={thCls} />
                  <TableHeaderCell label="Final Fee" className={thCls} />
                  <TableHeaderFilter
                    label="Payment Status"
                    value={fltPaymentStatus}
                    onChange={setFltPaymentStatus}
                    options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))}
                    allLabel="All payment statuses"
                    className={thCls}
                  />
                  <TableHeaderFilter
                    label="Admission Status"
                    value={fltAdmissionStatus}
                    onChange={setFltAdmissionStatus}
                    options={ADMISSION_STATUSES.map((s) => ({ value: s, label: s }))}
                    allLabel="All admission statuses"
                    className={thCls}
                  />
                  <TableHeaderCell label="Actions" className={thCls} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf5] text-[#334155]">
                {loading
                  ? [...Array.from({ length: 6 }).keys()].map((skeletonIdx) => (
                      <tr key={skeletonIdx}>
                        <td colSpan={colCount} className="px-4 py-3 text-center align-middle">
                          <div className="h-5 animate-pulse rounded bg-slate-100" />
                        </td>
                      </tr>
                    ))
                  : leads.map((lead) => {
                      const fu = lead.follow_up_date ? String(lead.follow_up_date) : null;
                      const hot = lead.priority === "Hot";
                      const program = lead.interested_program || lead.service_interest || "—";
                      const contactable = canContactLead(lead);
                      return (
                        <tr
                          key={lead.id}
                          className={[
                            hot ? "outline outline-2 outline-orange-200/70" : "",
                            fu === today ? "shadow-[inset_3px_0_0_#c9a227]" : "",
                          ].join(" ")}
                        >
                          {pickMode ? (
                            <td className={TABLE_CHECK_TD}>
                              <div className="flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={pickedIds?.has(lead.id) ?? false}
                                  onChange={() => onTogglePick?.(lead.id)}
                                  className="h-4 w-4 rounded border-[#cbd5e1]"
                                />
                              </div>
                            </td>
                          ) : null}
                          {showBulk ? (
                            <td className={TABLE_CHECK_TD}>
                              <div className="flex justify-center">
                                <TableBulkCheckbox
                                  checked={bulkSelection!.isSelected(lead.id)}
                                  onChange={() => bulkSelection!.onToggle(lead.id)}
                                  ariaLabel={`Select ${displayLeadName(lead)}`}
                                />
                              </div>
                            </td>
                          ) : null}
                          <td
                            className={`sticky-col whitespace-nowrap px-4 py-3 text-center align-middle font-semibold text-slate-900 min-w-[14rem] ${
                              pickMode || showBulk ? "sticky-col-after-check" : "sticky-col-1"
                            }`}
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span>{displayLeadName(lead) || "—"}</span>
                              {lead.current_call_employee_id ? (
                                <span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-[10px] font-semibold text-[#1e3a5f]">
                                  Calling: {employeeNameMap[lead.current_call_employee_id] || "Staff"}
                                  {lead.current_call_started_at
                                    ? ` · ${new Date(lead.current_call_started_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
                                    : ""}
                                </span>
                              ) : lead.last_call_outcome ? (
                                <span className="max-w-[12rem] truncate text-[10px] font-normal text-[#64748b]" title={lead.last_call_outcome}>
                                  Last: {lead.last_call_outcome}
                                  {typeof lead.total_call_attempts === "number" ? ` · ${lead.total_call_attempts} attempts` : ""}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-3 text-center align-middle min-w-[11rem] ${
                              pickMode || showBulk ? "" : "sticky-col sticky-col-2"
                            }`}
                          >
                            <div className="flex justify-center">
                              <StudentOutreachButtons
                                mode="phone"
                                phone={lead.phone}
                                phoneCalled={lead.phone_called}
                                onPhoneClick={contactable ? () => void onPhoneClick(lead) : undefined}
                              />
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-center align-middle">
                            <div className="flex justify-center">
                              <StudentOutreachButtons
                                mode="whatsapp"
                                phone={lead.phone}
                                whatsapp={lead.whatsapp}
                                whatsappSent={lead.whatsapp_sent}
                                onWhatsAppClick={contactable ? () => void onWhatsAppClick(lead) : undefined}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center align-middle">
                            <div className="flex justify-center">
                              <StudentOutreachButtons
                                mode="email"
                                email={lead.email}
                                emailSent={lead.email_sent}
                                onEmailClick={contactable ? () => void onEmailClick(lead) : undefined}
                              />
                            </div>
                          </td>
                          <td className={tdCls}>{lead.city || "—"}</td>
                          <td className={tdTrunc}>{lead.current_profile || "—"}</td>
                          <td className={tdCls}>{lead.degree || "—"}</td>
                          <td className={tdTrunc}>{lead.college_company || lead.company_name || "—"}</td>
                          <td className={tdCls}>{lead.year_of_passing || "—"}</td>
                          <td className={tdCls}>{lead.employment_status || "—"}</td>
                          <td className={tdCls}>{formatMoney(lead.current_salary)}</td>
                          <td className={tdTrunc}>{String(program)}</td>
                          <td className={tdTrunc}>{lead.career_goal || "—"}</td>
                          <td className={tdTrunc}>{lead.preferred_job_role || "—"}</td>
                          <td className={tdCls}>{formatMoney(lead.target_salary)}</td>
                          <td className={tdTrunc}>{lead.current_skill_level || "—"}</td>
                          <td className={tdTrunc}>{lead.main_career_problem || "—"}</td>
                          <td className={tdCls}>{lead.joining_timeline || "—"}</td>
                          <td className={tdCls}>{formatMoney(lead.budget)}</td>
                          <td className={tdCls}>{lead.payment_plan || "—"}</td>
                          <td className={tdCls}>{lead.parent_approval_required || "—"}</td>
                          <td className={tdCls}>{lead.decision_maker || "—"}</td>
                          <td className={tdCls}>{lead.preferred_batch || "—"}</td>
                          <td className={tdCls}>{lead.laptop_availability || "—"}</td>
                          <td className={tdCls}>{lead.source || "—"}</td>
                          <td className={tdTrunc}>{lead.assigned_to ? employeeNameMap[lead.assigned_to] : "—"}</td>
                          <td className={tdCls}>{lead.lead_stage || "—"}</td>
                          <td className="px-4 py-3 text-center align-middle">
                            <div className="flex justify-center">
                              <LeadStatusBadge status={String(lead.status)} />
                            </div>
                          </td>
                          <td className={`${tdCls} font-medium capitalize`}>{lead.priority || "—"}</td>
                          <td className={tdTrunc}>{lead.primary_objection || "—"}</td>
                          <td className={`${tdCls} text-xs`}>{formatDisplayDate(fu)}</td>
                          <td className={tdCls}>{formatMoney(lead.fee_quoted ?? lead.proposal_amount)}</td>
                          <td className={tdCls}>{formatMoney(lead.final_fee)}</td>
                          <td className={tdCls}>{lead.payment_status || "—"}</td>
                          <td className={tdCls}>{lead.admission_status || "—"}</td>
                          <td className="min-w-[14rem] whitespace-nowrap px-4 py-3 text-center align-middle text-xs">
                            <div className="inline-flex flex-wrap items-center justify-center gap-3">
                              <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onProfile(lead)}>
                                View
                              </button>
                              {canEditLead(lead) && (
                                <button type="button" className="font-semibold text-slate-600 hover:underline" onClick={() => onEdit(lead)}>
                                  Edit
                                </button>
                              )}
                              {isAdmin && (
                                <button type="button" className="font-semibold text-rose-600 hover:underline" onClick={() => onDelete(lead.id)}>
                                  Delete
                                </button>
                              )}
                              <button type="button" className="font-semibold text-teal-700 hover:underline" onClick={() => onAddFollow(lead)}>
                                Follow-up
                              </button>
                              <button type="button" className="font-semibold text-violet-700 hover:underline" onClick={() => onOpenActivity(lead)}>
                                Activity
                              </button>
                              {isAdmin && !isClosedLeadStatus(String(lead.status)) && (
                                <button type="button" className="font-semibold text-emerald-700 hover:underline" onClick={() => onConvert(lead)}>
                                  Admit
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                {!loading && leads.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-5 py-10 text-center align-middle text-slate-500">
                      No students match these filters yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        }
        mobile={
          loading ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
              No students match these filters yet.
            </p>
          ) : (
            leads.map((lead) => {
              const program = lead.interested_program || lead.service_interest || "—";
              const canEdit = canEditLead(lead);
              const contactable = canContactLead(lead);
              const canAdmit = isAdmin && !isClosedLeadStatus(String(lead.status));
              const counsellor = lead.assigned_to ? employeeNameMap[lead.assigned_to] : "—";
              const stageOrStatus = lead.lead_stage || lead.status || "—";
              const fuBadge = followUpBadge(lead.follow_up_date, lead.follow_up_time);
              const moreActions = [
                { label: "Add Activity", onClick: () => onOpenActivity(lead) },
                { label: "View", onClick: () => onProfile(lead) },
                ...(canEdit ? [{ label: "Edit", onClick: () => onEdit(lead) }] : []),
                ...(canAdmit ? [{ label: "Admit", onClick: () => onConvert(lead) }] : []),
                ...(isAdmin
                  ? [{ label: "Delete", onClick: () => onDelete(lead.id), destructive: true as const }]
                  : []),
              ];
              return (
                <MobileRecordCard
                  key={lead.id}
                  title={displayLeadName(lead) || "—"}
                  subtitle={dash(lead.phone)}
                  showSelect={pickMode || showBulk}
                  selected={
                    pickMode ? (pickedIds?.has(lead.id) ?? false) : showBulk ? bulkSelection!.isSelected(lead.id) : false
                  }
                  onToggleSelect={
                    pickMode
                      ? () => onTogglePick?.(lead.id)
                      : showBulk
                        ? () => bulkSelection!.onToggle(lead.id)
                        : undefined
                  }
                  selectAriaLabel={`${pickMode ? "Pick" : "Select"} ${displayLeadName(lead)}`}
                  previewFields={[
                    { label: "Mobile", value: dash(lead.phone) },
                    { label: "Program", value: dash(program) },
                    { label: "Stage/Status", value: dash(stageOrStatus) },
                    { label: "Counsellor", value: dash(counsellor) },
                    {
                      label: "Last call",
                      value: lead.last_call_outcome
                        ? `${lead.last_call_outcome}${lead.last_contacted_at ? ` · ${formatDateTimeIST(String(lead.last_contacted_at))}` : ""}`
                        : "Not contacted",
                    },
                    {
                      label: "Next follow-up",
                      value: (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <span>{formatFollowUpFriendly(lead.follow_up_date, lead.follow_up_time)}</span>
                          {fuBadge === "overdue" ? (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                              Overdue
                            </span>
                          ) : fuBadge === "today" ? (
                            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                              Due today
                            </span>
                          ) : null}
                        </span>
                      ),
                    },
                    {
                      label: "Call attempts",
                      value: typeof lead.total_call_attempts === "number" ? String(lead.total_call_attempts) : "0",
                    },
                    {
                      label: "Calling now",
                      value: lead.current_call_employee_id
                        ? `${employeeNameMap[lead.current_call_employee_id] || "Staff"}${
                            lead.current_call_started_at
                              ? ` · ${formatDateTimeIST(String(lead.current_call_started_at))}`
                              : ""
                          }`
                        : "—",
                    },
                  ]}
                  detailFields={[
                    { label: "Student Name", value: displayLeadName(lead) || "—" },
                    { label: "Mobile", value: dash(lead.phone) },
                    { label: "WhatsApp", value: dash(lead.whatsapp) },
                    { label: "Email", value: dash(lead.email) },
                    { label: "City", value: dash(lead.city) },
                    { label: "Current Profile", value: dash(lead.current_profile) },
                    { label: "Degree", value: dash(lead.degree) },
                    { label: "College/Company", value: dash(lead.college_company || lead.company_name) },
                    { label: "Year of Passing", value: dash(lead.year_of_passing) },
                    { label: "Employment Status", value: dash(lead.employment_status) },
                    { label: "Current Salary", value: formatMoney(lead.current_salary) },
                    { label: "Interested Program", value: dash(program) },
                    { label: "Career Goal", value: dash(lead.career_goal) },
                    { label: "Preferred Job Role", value: dash(lead.preferred_job_role) },
                    { label: "Target Salary", value: formatMoney(lead.target_salary) },
                    { label: "Lead Source", value: dash(lead.source) },
                    { label: "Counsellor", value: dash(counsellor) },
                    { label: "Lead Stage", value: dash(lead.lead_stage) },
                    { label: "Lead Status", value: dash(lead.status) },
                    { label: "Priority", value: dash(lead.priority) },
                    { label: "Primary Objection", value: dash(lead.primary_objection) },
                    { label: "Next Follow-up", value: formatFollowUpFriendly(lead.follow_up_date, lead.follow_up_time) },
                    { label: "Last call outcome", value: dash(lead.last_call_outcome) },
                    { label: "Last contacted", value: lead.last_contacted_at ? formatDateTimeIST(String(lead.last_contacted_at)) : "—" },
                    { label: "Call attempts", value: String(lead.total_call_attempts ?? 0) },
                    { label: "Fee Quoted", value: formatMoney(lead.fee_quoted ?? lead.proposal_amount) },
                    { label: "Final Fee", value: formatMoney(lead.final_fee) },
                    { label: "Payment Status", value: dash(lead.payment_status) },
                    { label: "Admission Status", value: dash(lead.admission_status) },
                    { label: "Notes", value: dash(lead.notes), clamp: true },
                  ]}
                  outreachSlot={
                    contactable ? (
                      <div className="space-y-2">
                        {lead.current_call_employee_id ? (
                          <p className="rounded-lg bg-[#dbeafe] px-2 py-1.5 text-center text-xs font-semibold text-[#1e3a5f]">
                            Currently calling: {employeeNameMap[lead.current_call_employee_id] || "Staff"}
                            {lead.current_call_started_at
                              ? ` – started at ${formatDateTimeIST(String(lead.current_call_started_at))}`
                              : ""}
                          </p>
                        ) : null}
                        <StudentOutreachButtons
                          mode="all"
                          phone={lead.phone}
                          whatsapp={lead.whatsapp || lead.phone}
                          email={lead.email}
                          phoneCalled={lead.phone_called}
                          whatsappSent={lead.whatsapp_sent}
                          emailSent={lead.email_sent}
                          onPhoneClick={() => onPhoneClick(lead)}
                          onWhatsAppClick={() => onWhatsAppClick(lead)}
                          onEmailClick={() => onEmailClick(lead)}
                        />
                      </div>
                    ) : undefined
                  }
                  primaryActions={[
                    ...(contactable ? [{ label: "Follow-up", onClick: () => onAddFollow(lead) }] : []),
                    { label: "View", onClick: () => onProfile(lead) },
                    ...(canEdit ? [{ label: "Edit", onClick: () => onEdit(lead) }] : []),
                  ]}
                  moreActions={moreActions}
                />
              );
            })
          )
        }
      />
      {pagination ? (
        <TablePagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          pageSize={pagination.pageSize}
          onPageChange={pagination.onPageChange}
          onPageSizeChange={pagination.onPageSizeChange}
          className="rounded-b-[20px]"
        />
      ) : null}
    </div>
  );
}

function ConvertedTable({
  leads,
  employeeNameMap,
  isAdmin,
  onProfile,
  bulkSelection,
}: {
  leads: CrmClientRow[];
  employeeNameMap: Record<string, string>;
  isAdmin: boolean;
  onProfile: (l: CrmClientRow) => void;
  bulkSelection?: {
    allSelected: boolean;
    someSelected: boolean;
    isSelected: (id: string) => boolean;
    onToggleAll: () => void;
    onToggle: (id: string) => void;
  };
}) {
  const rows = useMemo(
    () =>
      leads.filter((leadEntry) => {
        const st = normalizeStatus(String(leadEntry.status));
        return st === "Converted" || st === "Admitted";
      }),
    [leads],
  );
  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(rows, 25);
  const showBulk = Boolean(bulkSelection);
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white">
      <ResponsiveDataView
        selectAll={
          showBulk
            ? {
                checked: bulkSelection!.allSelected,
                indeterminate: bulkSelection!.someSelected,
                onChange: bulkSelection!.onToggleAll,
                label: "Select all",
              }
            : undefined
        }
        desktop={
          <div className="responsive-table-wrap">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-[#f1f6fc] text-[#64748b]">
                <tr>
                  {showBulk ? (
                    <th className="w-10 px-3 py-2">
                      <TableBulkCheckbox
                        checked={bulkSelection!.allSelected}
                        indeterminate={bulkSelection!.someSelected}
                        disabled={!rows.length}
                        onChange={bulkSelection!.onToggleAll}
                        ariaLabel="Select all converted leads"
                      />
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Company</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Services</th>
                  <th className="px-3 py-2 text-left">Deal</th>
                  <th className="px-3 py-2 text-left">Converted</th>
                  <th className="px-3 py-2 text-left">Owner</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((convertedLead) => (
                  <tr key={convertedLead.id} className="border-t border-[#eef2ff]">
                    {showBulk ? (
                      <td className="px-3 py-2">
                        <TableBulkCheckbox
                          checked={bulkSelection!.isSelected(convertedLead.id)}
                          onChange={() => bulkSelection!.onToggle(convertedLead.id)}
                          ariaLabel={`Select ${displayLeadName(convertedLead)}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2 font-mono text-xs">{convertedLead.client_code || "—"}</td>
                    <td className="px-3 py-2 font-semibold">{displayLeadName(convertedLead)}</td>
                    <td>{convertedLead.company_name || "—"}</td>
                    <td className="whitespace-nowrap">{convertedLead.phone || "—"}</td>
                    <td className="truncate max-w-[180px]">{convertedLead.email || "—"}</td>
                    <td className="max-w-[200px] truncate text-xs">{String(convertedLead.service_interest || "—")}</td>
                    <td>
                      {convertedLead.proposal_amount != null
                        ? `₹${Number(convertedLead.proposal_amount).toLocaleString()}`
                        : "—"}
                    </td>
                    <td>
                      {convertedLead.converted_at
                        ? new Date(String(convertedLead.converted_at)).toLocaleDateString()
                        : "—"}
                    </td>
                    <td>{convertedLead.assigned_to ? employeeNameMap[convertedLead.assigned_to] : "—"}</td>
                    <td className="space-x-2 px-3 py-2 text-right text-xs">
                      <button
                        type="button"
                        className="font-semibold text-blue-700 hover:underline"
                        onClick={() => onProfile(convertedLead)}
                      >
                        Profile
                      </button>
                      {isAdmin ? (
                        <>
                          <button type="button" className="text-slate-400" disabled title="Connect Project Master next">
                            Create project
                          </button>
                          <button type="button" className="text-slate-400" disabled title="Coming soon">
                            Add doc
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
        mobile={
          totalItems === 0 ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
              No converted / admitted leads for the current filters.
            </p>
          ) : (
            pageRows.map((convertedLead) => (
              <MobileRecordCard
                key={convertedLead.id}
                title={displayLeadName(convertedLead)}
                subtitle={convertedLead.client_code || convertedLead.phone || undefined}
                showSelect={showBulk}
                selected={showBulk ? bulkSelection!.isSelected(convertedLead.id) : false}
                onToggleSelect={showBulk ? () => bulkSelection!.onToggle(convertedLead.id) : undefined}
                selectAriaLabel={`Select ${displayLeadName(convertedLead)}`}
                previewFields={[
                  { label: "Company", value: convertedLead.company_name || "—" },
                  { label: "Phone", value: convertedLead.phone || "—" },
                  {
                    label: "Deal",
                    value:
                      convertedLead.proposal_amount != null
                        ? `₹${Number(convertedLead.proposal_amount).toLocaleString()}`
                        : "—",
                  },
                  {
                    label: "Owner",
                    value: convertedLead.assigned_to ? employeeNameMap[convertedLead.assigned_to] : "—",
                  },
                ]}
                detailFields={[
                  { label: "Code", value: convertedLead.client_code || "—" },
                  { label: "Client", value: displayLeadName(convertedLead) },
                  { label: "Company", value: convertedLead.company_name || "—" },
                  { label: "Phone", value: convertedLead.phone || "—" },
                  { label: "Email", value: convertedLead.email || "—" },
                  { label: "Services", value: String(convertedLead.service_interest || "—") },
                  {
                    label: "Deal",
                    value:
                      convertedLead.proposal_amount != null
                        ? `₹${Number(convertedLead.proposal_amount).toLocaleString()}`
                        : "—",
                  },
                  {
                    label: "Converted",
                    value: convertedLead.converted_at
                      ? new Date(String(convertedLead.converted_at)).toLocaleDateString()
                      : "—",
                  },
                  {
                    label: "Owner",
                    value: convertedLead.assigned_to ? employeeNameMap[convertedLead.assigned_to] : "—",
                  },
                ]}
                primaryActions={[{ label: "Profile", onClick: () => onProfile(convertedLead) }]}
              />
            ))
          )
        }
      />
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function ProposalTrackerTable({
  leads,
  isAdmin,
  onEdit,
  bulkSelection,
}: {
  leads: CrmClientRow[];
  isAdmin: boolean;
  onEdit: (l: CrmClientRow) => void;
  bulkSelection?: {
    allSelected: boolean;
    someSelected: boolean;
    isSelected: (id: string) => boolean;
    onToggleAll: () => void;
    onToggle: (id: string) => void;
  };
}) {
  const {
    paginatedItems: pageRows,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(leads, 25);
  const showBulk = Boolean(bulkSelection);
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <ResponsiveDataView
        selectAll={
          showBulk
            ? {
                checked: bulkSelection!.allSelected,
                indeterminate: bulkSelection!.someSelected,
                onChange: bulkSelection!.onToggleAll,
                label: "Select all",
              }
            : undefined
        }
        desktop={
          <div className="responsive-table-wrap">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-[#f1f6fc] text-[#64748b]">
                <tr>
                  {showBulk ? (
                    <th className="w-10 px-3 py-2">
                      <TableBulkCheckbox
                        checked={bulkSelection!.allSelected}
                        indeterminate={bulkSelection!.someSelected}
                        disabled={!totalItems}
                        onChange={bulkSelection!.onToggleAll}
                        ariaLabel="Select all proposal leads"
                      />
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Lead</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Company</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Amount</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Sent date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Proposal</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {totalItems === 0 ? (
                  <tr>
                    <td colSpan={showBulk ? 8 : 7} className="px-6 py-12 text-center text-[#64748b]">
                      No leads match the current filters. Adjust filters on the All Leads tab or add a lead.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((proposalLead) => (
                    <tr key={proposalLead.id} className="border-t border-[#eef2ff]">
                      {showBulk ? (
                        <td className="px-3 py-2">
                          <TableBulkCheckbox
                            checked={bulkSelection!.isSelected(proposalLead.id)}
                            onChange={() => bulkSelection!.onToggle(proposalLead.id)}
                            ariaLabel={`Select ${displayLeadName(proposalLead)}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2 font-semibold text-slate-900">{displayLeadName(proposalLead) || "—"}</td>
                      <td className="max-w-[200px] truncate px-3 py-2">{proposalLead.company_name || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {proposalLead.proposal_amount != null
                          ? `₹${Number(proposalLead.proposal_amount).toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <ProposalStatusBadge status={String(proposalLead.proposal_status)} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{proposalLead.proposal_sent_date || "—"}</td>
                      <td className="px-3 py-2">
                        <ProposalFileOpenCell
                          entityType="student"
                          entityId={proposalLead.id}
                          filePath={proposalLead.proposal_file_path}
                          legacyHref={proposalLead.proposal_link}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isAdmin ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-blue-700 hover:underline"
                            onClick={() => onEdit(proposalLead)}
                          >
                            Update
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Read only</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        }
        mobile={
          totalItems === 0 ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
              No leads match the current filters. Adjust filters on the All Leads tab or add a lead.
            </p>
          ) : (
            pageRows.map((proposalLead) => (
              <MobileRecordCard
                key={proposalLead.id}
                title={displayLeadName(proposalLead) || "—"}
                subtitle={proposalLead.company_name || undefined}
                showSelect={showBulk}
                selected={showBulk ? bulkSelection!.isSelected(proposalLead.id) : false}
                onToggleSelect={showBulk ? () => bulkSelection!.onToggle(proposalLead.id) : undefined}
                selectAriaLabel={`Select ${displayLeadName(proposalLead)}`}
                previewFields={[
                  {
                    label: "Amount",
                    value:
                      proposalLead.proposal_amount != null
                        ? `₹${Number(proposalLead.proposal_amount).toLocaleString()}`
                        : "—",
                  },
                  { label: "Status", value: proposalLead.proposal_status || "—" },
                  { label: "Sent date", value: proposalLead.proposal_sent_date || "—" },
                ]}
                detailFields={[
                  { label: "Lead", value: displayLeadName(proposalLead) || "—" },
                  { label: "Company", value: proposalLead.company_name || "—" },
                  {
                    label: "Amount",
                    value:
                      proposalLead.proposal_amount != null
                        ? `₹${Number(proposalLead.proposal_amount).toLocaleString()}`
                        : "—",
                  },
                  { label: "Status", value: proposalLead.proposal_status || "—" },
                  { label: "Sent date", value: proposalLead.proposal_sent_date || "—" },
                ]}
                primaryActions={isAdmin ? [{ label: "Update", onClick: () => onEdit(proposalLead) }] : []}
              />
            ))
          )
        }
      />
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function ProposalFileOpenCell({
  entityType,
  entityId,
  filePath,
  legacyHref,
}: {
  entityType: "student" | "college";
  entityId: string;
  filePath?: string | null;
  legacyHref?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  if (filePath?.trim()) {
    return (
      <button
        type="button"
        disabled={busy}
        className="text-xs font-semibold text-[#a68b2e] hover:underline disabled:opacity-60"
        onClick={() => {
          void (async () => {
            setBusy(true);
            try {
              const res = await fetch("/api/proposals/signed-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entityType, entityId, download: false }),
              });
              const json = (await res.json()) as { url?: string; error?: string };
              if (!res.ok || !json.url) throw new Error(json.error || "Could not open file.");
              window.open(json.url, "_blank", "noopener,noreferrer");
            } catch {
              /* parent banners handle save errors; table open fails silently to avoid noisy popups */
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? "Opening…" : "View Proposal"}
      </button>
    );
  }
  if (legacyHref?.trim()) {
    return (
      <a
        href={legacyHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-semibold text-[#a68b2e] hover:underline"
      >
        Open link
      </a>
    );
  }
  return <span className="text-xs text-[#94a3b8]">Not Uploaded</span>;
}

function ProposalEditModal({
  lead,
  draft,
  setDraft,
  onClose,
  onSave,
  submitting,
  proposalFileMeta,
  pendingProposalFile,
  onPendingFileChange,
  onProposalMetaChange,
  onUploadError,
  onUploadSuccess,
}: {
  lead: CrmClientRow;
  draft: {
    status: CrmProposalStatus;
    amount: string;
    sent_date: string;
    proposal_link: string;
    quotation_link: string;
    agreement_link: string;
  };
  setDraft: Dispatch<
    SetStateAction<{
      status: CrmProposalStatus;
      amount: string;
      sent_date: string;
      proposal_link: string;
      quotation_link: string;
      agreement_link: string;
    }>
  >;
  onClose: () => void;
  onSave: () => void;
  submitting: boolean;
  proposalFileMeta: ProposalFileMeta;
  pendingProposalFile: File | null;
  onPendingFileChange: (file: File | null) => void;
  onProposalMetaChange: (meta: ProposalFileMeta) => void;
  onUploadError: (message: string) => void;
  onUploadSuccess: (message: string) => void;
}) {
  const { onBackdropClick } = useSuppressBackdropClose(1500);
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={() => onBackdropClick(onClose)} />
      <div className="fixed left-4 right-4 top-[8%] z-[61] mx-auto flex max-h-[85vh] max-w-lg flex-col overflow-hidden rounded-[20px] border border-[#e8dcc8] bg-white shadow-2xl sm:left-auto sm:right-10">
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <h4 className="text-lg font-semibold text-[#0f172a]">Update proposal</h4>
        <p className="mt-1 text-xs text-[#64748b]">{displayLeadName(lead) || "—"} · {lead.company_name || "—"}</p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Proposal status</span>
            <select
              className="rounded-lg border border-[#dbe6f3] bg-white px-3 py-2"
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as CrmProposalStatus }))}
            >
              {CRM_PROPOSAL_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Proposal amount (₹)</span>
            <Input value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} className="rounded-lg border-[#dbe6f3]" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Sent date</span>
            <Input type="date" value={draft.sent_date} onChange={(e) => setDraft((d) => ({ ...d, sent_date: e.target.value }))} className="rounded-lg border-[#dbe6f3]" />
          </label>
          <ProposalFileUpload
            entityType="student"
            entityId={lead.id}
            meta={proposalFileMeta}
            pendingFile={pendingProposalFile}
            onPendingFileChange={onPendingFileChange}
            onMetaChange={onProposalMetaChange}
            disabled={submitting}
            onError={onUploadError}
            onSuccess={onUploadSuccess}
          />
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Quotation link</span>
            <Input value={draft.quotation_link} onChange={(e) => setDraft((d) => ({ ...d, quotation_link: e.target.value }))} className="rounded-lg border-[#dbe6f3]" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Agreement link</span>
            <Input value={draft.agreement_link} onChange={(e) => setDraft((d) => ({ ...d, agreement_link: e.target.value }))} className="rounded-lg border-[#dbe6f3]" />
          </label>
          {draft.status === "Accepted" ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Accepted will mark this lead as <strong>Converted</strong> and set <strong>converted_at</strong> (and client code if missing).
            </p>
          ) : null}
        </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[#e8edf5] bg-white px-6 py-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-full bg-[#c9a227]" disabled={submitting} onClick={onSave}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}

function ActivityTable({
  rows,
  clientMap,
  employeeNameMap,
  loading,
}: {
  rows: ActivityRow[];
  clientMap: Record<string, CrmClientRow>;
  employeeNameMap: Record<string, string>;
  loading: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[#64748b]">
        Chronological log of CRM actions for leads you can access. Rows come from <code className="rounded bg-slate-100 px-1 text-xs">lead_activities</code>{" "}
        joined to lead names below.
      </p>
      <ResponsiveDataView
        desktop={
          <div className="responsive-table-wrap rounded-[20px] border border-[#dbe6f3] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-[#f1f6fc] text-[#64748b]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Date &amp; time</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Lead / client</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Activity type</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Notes</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Created by</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Loading activity…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-[#64748b]">
                      No activity found yet. Activities will appear when leads are created, follow-ups are added, proposals are updated, or status
                      changes.
                    </td>
                  </tr>
                ) : (
                  rows.map((ar) => {
                    const detail = [ar.notes, ar.old_value || ar.new_value ? `${ar.old_value ?? "?"} → ${ar.new_value ?? "?"}` : ""]
                      .filter(Boolean)
                      .join(" · ");
                    const by = ar.created_by ? employeeNameMap[ar.created_by] || ar.created_by.slice(0, 8) : "—";
                    return (
                      <tr key={ar.id} className="border-t border-[#f1f5f9]">
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatDateTimeIST(String(ar.created_at))}</td>
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {clientMap[ar.client_id] ? displayLeadName(clientMap[ar.client_id]) || "—" : "Unknown lead"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-800">{ar.activity_type || "—"}</td>
                        <td className="max-w-md px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap">{detail || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">{by}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        }
        mobile={
          loading ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">Loading activity…</p>
          ) : rows.length === 0 ? (
            <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
              No activity found yet. Activities will appear when leads are created, follow-ups are added, proposals are updated, or status
              changes.
            </p>
          ) : (
            rows.map((ar) => {
              const detail = [ar.notes, ar.old_value || ar.new_value ? `${ar.old_value ?? "?"} → ${ar.new_value ?? "?"}` : ""]
                .filter(Boolean)
                .join(" · ");
              const by = ar.created_by ? employeeNameMap[ar.created_by] || ar.created_by.slice(0, 8) : "—";
              const leadName = clientMap[ar.client_id] ? displayLeadName(clientMap[ar.client_id]) || "—" : "Unknown lead";
              return (
                <MobileRecordCard
                  key={ar.id}
                  title={leadName}
                  subtitle={formatDateTimeIST(String(ar.created_at))}
                  previewFields={[
                    { label: "Activity type", value: ar.activity_type || "—" },
                    { label: "Created by", value: by },
                  ]}
                  detailFields={[
                    { label: "Date & time", value: formatDateTimeIST(String(ar.created_at)) },
                    { label: "Lead / client", value: leadName },
                    { label: "Activity type", value: ar.activity_type || "—" },
                    { label: "Notes", value: detail || "—", clamp: true },
                    { label: "Created by", value: by },
                  ]}
                />
              );
            })
          )
        }
      />
    </div>
  );
}

function ReportStatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <article className="flex min-h-[132px] flex-col rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <p className="text-sm font-medium text-[#64748b]">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#0f172a] sm:text-3xl">{value}</p>
      {subtitle ? <p className="mt-auto pt-2 text-xs text-[#94a3b8]">{subtitle}</p> : <span className="mt-auto block pt-2 text-xs text-transparent">.</span>}
    </article>
  );
}

function ReportsPanel({
  leads,
  followRows,
  isAdmin,
  employeeNameMap,
}: {
  leads: CrmClientRow[];
  followRows: FollowRow[];
  isAdmin: boolean;
  employeeNameMap: Record<string, string>;
}) {
  const thisMonthKEY = monthKeyFromDate(new Date());
  const thisMonthLeads = leads.filter((l) => (l.created_at ? monthKeyFromDate(new Date(String(l.created_at))) === thisMonthKEY : false)).length;

  const total = leads.length;
  const fuTotal = followRows.length;
  const fuDone = followRows.filter((followRowCompletion) => followRowCompletion.status === "Completed").length;
  const followUpCompletionPct = fuTotal ? `${((fuDone / fuTotal) * 100).toFixed(1)}%` : total === 0 ? "0%" : "—";
  const convertedN = leads.filter((lEntry) => normalizeStatus(String(lEntry.status)) === "Converted").length;
  const lostN = leads.filter((lEntry) => normalizeStatus(String(lEntry.status)) === "Lost").length;
  const conversionRate = total ? `${((convertedN / total) * 100).toFixed(1)}%` : "0%";
  const lostRate = total ? `${((lostN / total) * 100).toFixed(1)}%` : "0%";

  let avgDeal = 0;
  const deals = leads
    .filter((lDeal) => lDeal.proposal_amount != null)
    .map((lDeal) => Number(lDeal.proposal_amount));
  if (deals.length) avgDeal = deals.reduce((aDeal, dealVal) => aDeal + dealVal, 0) / deals.length;

  let revenuePotential = 0;
  if (isAdmin) {
    revenuePotential = leads
      .filter((lRp) => !["Converted", "Lost", "Not Interested"].includes(normalizeStatus(String(lRp.status))))
      .reduce((accRp, lr) => accRp + Number(lr.budget ?? 0), 0);
  }

  const bySource = new Map<string, number>();
  leads.forEach((leadEntry) => {
    const ky = leadEntry.source || "Unknown";
    bySource.set(ky, (bySource.get(ky) || 0) + 1);
  });

  const byOwner = new Map<string, number>();
  leads.forEach((leadAssignment) => {
    const id = leadAssignment.assigned_to || "";
    const ky = id ? employeeNameMap[id] || id.slice(0, 8) : "Unassigned";
    byOwner.set(ky, (byOwner.get(ky) || 0) + 1);
  });

  const bySvc = new Map<string, number>();
  leads.forEach((ls) =>
    servicesFromCsv(String(ls.service_interest ?? "")).forEach((svcName) =>
      bySvc.set(svcName, (bySvc.get(svcName) || 0) + 1),
    ),
  );

  const byStatus = new Map<string, number>();
  leads.forEach((lsStat) =>
    byStatus.set(normalizeStatus(String(lsStat.status)), (byStatus.get(normalizeStatus(String(lsStat.status))) || 0) + 1),
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#64748b]">Metrics use the leads visible in this workspace (respects your role and filters on other tabs).</p>
      <div className="stat-cards-grid">
        <ReportStatCard title="Total leads this month" value={thisMonthLeads} subtitle="Created in current calendar month" />
        <ReportStatCard title="Conversion rate" value={conversionRate} subtitle="Converted ÷ all visible leads" />
        <ReportStatCard title="Lost rate" value={lostRate} subtitle="Lost ÷ all visible leads" />
        <ReportStatCard
          title="Average deal value"
          value={isAdmin && deals.length ? `₹${Math.round(avgDeal).toLocaleString()}` : "—"}
          subtitle={isAdmin ? "From proposal amounts on visible leads" : "Visible to admin only"}
        />
        <ReportStatCard
          title="Revenue potential"
          value={isAdmin ? `₹${Math.round(revenuePotential).toLocaleString()}` : "—"}
          subtitle={isAdmin ? "Sum of budgets (excl. closed)" : "Admin view"}
        />
        <ReportStatCard
          title="Follow-up completion rate"
          value={followUpCompletionPct}
          subtitle={fuTotal ? `${fuDone} of ${fuTotal} follow-ups completed` : "No follow-up rows loaded"}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SimpleReportTable title="Source-wise leads" pairs={[...bySource.entries()]} />
        <SimpleReportTable title="Employee-wise leads" pairs={[...byOwner.entries()]} />
        <SimpleReportTable title="Service-wise leads" pairs={[...bySvc.entries()]} />
        <SimpleReportTable title="Status-wise pipeline" pairs={[...byStatus.entries()]} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-xl" disabled title="Coming soon">
          Export Excel
        </Button>
        <Button variant="outline" className="rounded-xl" disabled title="Coming soon">
          Export PDF
        </Button>
      </div>
    </div>
  );
}

function SimpleReportTable({ title, pairs }: { title: string; pairs: [string, number][] }) {
  const rows = [...pairs].sort((aArr, bArr) => bArr[1] - aArr[1]);
  return (
    <div className="rounded-[20px] border border-[#dbe6f3] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <p className="border-b border-[#f1f5f9] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-4 py-8 text-center text-[#64748b]">
                0 — no rows in this breakdown yet.
              </td>
            </tr>
          ) : (
            rows.map(([lbl, qty]) => (
              <tr key={lbl + String(qty)} className="border-t border-[#eef2ff]">
                <td className="px-4 py-2 font-medium text-slate-800">{lbl}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-700">{qty}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CrmSettingsPanel({
  lists,
  onSaved,
  onError,
}: {
  lists: CrmSettingsLists;
  onSaved: (next: CrmSettingsLists) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState({
    leadSources: listToLines(lists.leadSources),
    leadStatuses: listToLines(lists.leadStatuses),
    interestedPrograms: listToLines(lists.interestedPrograms),
    followUpTypes: listToLines(lists.followUpTypes),
    priorityTypes: listToLines(lists.priorityTypes),
  });
  const [saving, setSaving] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      leadSources: listToLines(lists.leadSources),
      leadStatuses: listToLines(lists.leadStatuses),
      interestedPrograms: listToLines(lists.interestedPrograms),
      followUpTypes: listToLines(lists.followUpTypes),
      priorityTypes: listToLines(lists.priorityTypes),
    });
  }, [lists]);

  const patchField = (key: keyof typeof draft, value: string) => {
    setLocalMsg(null);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setLocalMsg(null);
    try {
      const payload: CrmSettingsLists = {
        leadSources: linesToList(draft.leadSources),
        leadStatuses: linesToList(draft.leadStatuses),
        followUpTypes: linesToList(draft.followUpTypes),
        priorityTypes: linesToList(draft.priorityTypes),
        interestedPrograms: linesToList(draft.interestedPrograms),
        serviceCategories: linesToList(draft.interestedPrograms),
      };
      if (!payload.leadSources.length || !payload.leadStatuses.length) {
        throw new Error("Lead sources and lead statuses need at least one entry each.");
      }
      if (!payload.followUpTypes.length || !payload.priorityTypes.length) {
        throw new Error("Follow-up types and priority types need at least one entry each.");
      }
      if (!payload.interestedPrograms.length) {
        throw new Error("Programs / service interests need at least one entry.");
      }
      const next = await persistCrmSettingsLists(payload);
      onSaved(next);
      setLocalMsg("Saved to system settings.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save CRM settings.";
      onError(msg);
      setLocalMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, description: string, key: keyof typeof draft) => (
    <article className="flex flex-col rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <h4 className="text-sm font-semibold text-[#0f172a]">{label}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{description}</p>
      <textarea
        className="mt-3 min-h-[140px] w-full rounded-lg border border-[#dbe6f3] bg-[#f8fbff] px-3 py-2 text-sm text-[#334155] outline-none focus:border-[#c9a227]"
        value={draft[key]}
        onChange={(e) => patchField(key, e.target.value)}
        placeholder="One entry per line"
      />
      <p className="mt-1 text-[11px] text-[#94a3b8]">One entry per line · blanks ignored · duplicates removed on save</p>
    </article>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[20px] border border-blue-100 bg-[#f8fbff] p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#0f172a]">CRM configuration</h3>
          <p className="mt-2 text-sm text-[#64748b]">
            These lists power Student Master dropdowns, filters, and the pipeline. Changes save to{" "}
            <code className="rounded bg-white px-1 text-xs">system_settings</code> (key{" "}
            <code className="rounded bg-white px-1 text-xs">crm</code>) and match Admin → System Settings → CRM.
          </p>
          {localMsg ? <p className="mt-2 text-xs font-medium text-blue-800">{localMsg}</p> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl border-[#dbe6f3]"
            disabled={saving}
            onClick={() => {
              setDraft({
                leadSources: listToLines(lists.leadSources),
                leadStatuses: listToLines(lists.leadStatuses),
                interestedPrograms: listToLines(lists.interestedPrograms),
                followUpTypes: listToLines(lists.followUpTypes),
                priorityTypes: listToLines(lists.priorityTypes),
              });
              setLocalMsg(null);
            }}
          >
            Reset
          </Button>
          <Button
            type="button"
            className="rounded-xl bg-[#c9a227] text-white hover:bg-[#b8911f]"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {field("Lead sources", "Where new business originates. Used in the Add / Edit Student form and table filters.", "leadSources")}
        {field("Lead statuses", "Pipeline stages from first touch through close. Columns on the Pipeline tab.", "leadStatuses")}
        {field("Programs / service interests", "Interested program options on the Add / Edit Student form.", "interestedPrograms")}
        {field("Follow-up types", "How the next touch is planned (call, message, meeting, email).", "followUpTypes")}
        {field("Priority types", "Deal temperature for triage.", "priorityTypes")}
        <article className="flex flex-col rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
          <h4 className="text-sm font-semibold text-[#0f172a]">Default lead owner</h4>
          <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
            New leads are owned by the signed-in user. Share work by assigning a Student Lead task — ownership does not transfer via Settings.
          </p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-[#475569]">
            <li>Configured per lead on create (Assigned To stays with creator).</li>
          </ul>
        </article>
      </div>
    </div>
  );
}

function QuickFollowModal({
  target,
  draft,
  setDraft,
  onClose,
  onSave,
  submitting,
  followUpTypes,
}: {
  target: CrmClientRow;
  draft: { date: string; time: string; type: string; notes: string };
  setDraft: Dispatch<SetStateAction<{ date: string; time: string; type: string; notes: string }>>;
  onClose: () => void;
  onSave: () => void;
  submitting: boolean;
  followUpTypes: readonly string[];
}) {
  const types = followUpTypes.length ? followUpTypes : CRM_FOLLOW_UP_TYPES_UI;
  useEffect(() => {
    const t = typeof target.follow_up_time === "string" ? target.follow_up_time.slice(0, 5) : "";
    const opts = followUpTypes.length ? followUpTypes : [...CRM_FOLLOW_UP_TYPES_UI];
    setDraft({
      date: (typeof target.follow_up_date === "string" ? target.follow_up_date.slice(0, 10) : "") || "",
      time: t,
      type: (target.follow_up_type as string | null | undefined)?.trim() || opts[0] || "Call",
      notes: "",
    });
  }, [target.id, setDraft, target.follow_up_date, target.follow_up_time, target.follow_up_type, followUpTypes]);

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={onClose} />
      <div className="fixed left-4 right-4 top-[15%] z-[61] mx-auto max-w-md rounded-[20px] border border-[#e8dcc8] bg-white p-5 shadow-2xl sm:left-auto">
        <h4 className="text-lg font-semibold text-[#0f172a]">Schedule follow-up</h4>
        <p className="mt-1 text-xs text-[#64748b]">{displayLeadName(target) || "Lead"} · {target.company_name || "—"}</p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Date</span>
            <Input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              className="rounded-lg border-[#dbe6f3]"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Time</span>
            <Input
              type="time"
              value={draft.time}
              onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
              className="rounded-lg border-[#dbe6f3]"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Type</span>
            <select
              className="rounded-lg border border-[#dbe6f3] bg-white px-3 py-2"
              value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
            >
              {types.map((ft) => (
                <option key={ft} value={ft}>
                  {ft}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Notes</span>
            <textarea
              rows={3}
              className="rounded-lg border border-[#dbe6f3] px-3 py-2"
              placeholder="Brief note for this follow-up"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="rounded-full bg-[#c9a227]" disabled={submitting} onClick={onSave}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}

function LinkRow({ label, href }: { label: string; href?: string | null }) {
  if (!href?.trim()) {
    return (
      <p className="text-xs text-[#64748b]">
        <span className="font-semibold text-[#475569]">{label}:</span> —
      </p>
    );
  }
  return (
    <p className="truncate text-xs">
      <span className="font-semibold text-[#475569]">{label}:</span>{" "}
      <a href={href.trim()} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
        Open link
      </a>
    </p>
  );
}

function ProfileModal({
  lead,
  onClose,
  employeeMap,
  follows,
  activities,
}: {
  lead: CrmClientRow;
  onClose: () => void;
  employeeMap: Record<string, string>;
  follows: FollowRow[];
  activities: ActivityRow[];
}) {
  const budgetTxt = lead.budget != null ? String(lead.budget) : "—";
  const scoreTxt = lead.lead_score !== null && lead.lead_score !== undefined ? String(lead.lead_score) : "—";
  const servicesList = servicesFromCsv(typeof lead.service_interest === "string" ? lead.service_interest : "");

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={onClose} />
      <div className="fixed inset-y-6 right-4 z-[61] mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[#e8dcc8] bg-white shadow-2xl sm:right-10">
        <div className="flex items-start justify-between border-b border-[#e8edf5] px-5 py-4">
          <div>
            <h3 className="text-xl font-semibold text-[#0f172a]">{displayLeadName(lead) || "—"}</h3>
            <p className="text-sm text-[#64748b]">{lead.company_name || "—"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <LeadStatusBadge status={normalizeStatus(lead.status)} />
              {lead.client_code ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {lead.client_code}
                </span>
              ) : null}
            </div>
          </div>
          <button type="button" className="text-sm text-[#64748b]" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4 text-sm">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Basic details</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[#475569]">
              <Dt label="Industry" value={lead.industry} />
              <Dt label="Source" value={lead.source} />
              <Dt label="Priority" value={lead.priority} />
              <Dt label="Lead score" value={scoreTxt} />
              <Dt label="Budget" value={budgetTxt} />
              <Dt label="Expected start" value={lead.expected_start_date} />
              <Dt label="Assigned to" value={lead.assigned_to ? employeeMap[lead.assigned_to] || lead.assigned_to : null} />
            </dl>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Contact</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[#475569]">
              <Dt label="Phone" value={lead.phone} />
              <Dt label="WhatsApp" value={lead.whatsapp} />
              <Dt label="Email" value={lead.email} />
            </dl>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Counselling details</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[#475569]">
              <Dt label="City" value={lead.city} />
              <Dt label="Current profile" value={lead.current_profile} />
              <Dt label="Interested program" value={lead.interested_program || lead.service_interest} />
              <Dt label="Career goal" value={lead.career_goal} />
              <Dt label="Preferred job role" value={lead.preferred_job_role} />
              <Dt label="Target salary" value={formatMoney(lead.target_salary)} />
              <Dt label="Skill level" value={lead.current_skill_level} />
              <Dt label="Main career problem" value={lead.main_career_problem || lead.requirement} />
              <Dt label="Full payment / instalment" value={lead.payment_plan} />
              <Dt label="Parent approval required" value={lead.parent_approval_required} />
              <Dt label="Decision maker" value={lead.decision_maker} />
              <Dt label="Laptop availability" value={lead.laptop_availability} />
              <Dt label="Preferred batch" value={lead.preferred_batch} />
              <Dt label="Joining timeline" value={lead.joining_timeline} />
              <Dt label="Program budget" value={formatMoney(lead.budget)} />
            </dl>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Employee outreach</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[#475569]">
              <Dt
                label="Phone call"
                value={lead.phone_called ? `Done${lead.phone_called_at ? ` · ${formatDateTimeIST(String(lead.phone_called_at))}` : ""}` : "Pending"}
              />
              <Dt
                label="WhatsApp"
                value={lead.whatsapp_sent ? `Done${lead.whatsapp_sent_at ? ` · ${formatDateTimeIST(String(lead.whatsapp_sent_at))}` : ""}` : "Pending"}
              />
              <Dt
                label="Email"
                value={lead.email_sent ? `Done${lead.email_sent_at ? ` · ${formatDateTimeIST(String(lead.email_sent_at))}` : ""}` : "Pending"}
              />
              <Dt label="Last contacted" value={lead.last_contacted_at ? formatDateTimeIST(String(lead.last_contacted_at)) : null} />
            </dl>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Requirement & services</h4>
            <p className="text-[#334155]">{lead.requirement ? String(lead.requirement) : "—"}</p>
            <div className="flex flex-wrap gap-1">
              {servicesList.length === 0 ? (
                <span className="text-xs text-[#64748b]">No services tagged</span>
              ) : (
                servicesList.map((s) => (
                  <span key={s} className="rounded-full bg-[#faf3e3] px-2 py-0.5 text-xs font-medium text-blue-800">
                    {s}
                  </span>
                ))
              )}
            </div>
            {lead.notes ? (
              <div className="rounded-lg border border-[#e8edf5] bg-[#f8fafc] p-3">
                <p className="text-xs font-semibold uppercase text-[#94a3b8]">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-[#475569]">{String(lead.notes)}</p>
              </div>
            ) : null}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Proposal</h4>
            <div className="flex flex-wrap items-center gap-2">
              <ProposalStatusBadge status={(lead.proposal_status as CrmProposalStatus | null | undefined) ?? "Not Sent"} />
              {lead.proposal_amount != null ? (
                <span className="text-xs text-[#475569]">Amount: {String(lead.proposal_amount)}</span>
              ) : null}
            </div>
            <Dt label="Sent date" value={lead.proposal_sent_date ? String(lead.proposal_sent_date).slice(0, 10) : null} />
            <LinkRow label="Proposal" href={lead.proposal_link ? String(lead.proposal_link) : null} />
            <LinkRow label="Quotation" href={lead.quotation_link ? String(lead.quotation_link) : null} />
            <LinkRow label="Agreement" href={lead.agreement_link ? String(lead.agreement_link) : null} />
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Follow-ups</h4>
            {follows.length === 0 ? (
              <p className="text-xs text-[#64748b]">No recorded follow-ups yet.</p>
            ) : (
              <ul className="max-h-40 space-y-2 overflow-y-auto text-xs">
                {follows.map((f) => (
                  <li key={f.id} className="rounded-lg border border-[#e8edf5] p-2">
                    <span className="font-medium text-[#334155]">
                      {f.follow_up_date} {f.follow_up_time || ""}
                    </span>
                    {" · "}
                    {f.follow_up_type || "—"} · {f.status || "Pending"}
                    {f.notes ? <p className="mt-1 text-[#64748b]">{f.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Activity timeline</h4>
            {activities.length === 0 ? (
              <p className="text-xs text-[#64748b]">No activities yet.</p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                {activities.slice(0, 25).map((a) => (
                  <li key={a.id} className="rounded-lg border border-[#e8edf5] p-2">
                    <p className="font-semibold text-[#334155]">{a.activity_type || "Activity"}</p>
                    <p className="text-[#64748b]">
                      {formatDateTimeIST(String(a.created_at))}
                      {a.created_by ? ` · ${employeeMap[a.created_by] || "Team member"}` : ""}
                    </p>
                    {a.notes ? <p className="mt-1 text-[#475569]">{a.notes}</p> : null}
                    {a.old_value || a.new_value ? (
                      <p className="mt-1 text-[#64748b]">
                        {a.old_value ? `From: ${a.old_value}` : ""}
                        {a.old_value && a.new_value ? " → " : ""}
                        {a.new_value ? `To: ${a.new_value}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-1 rounded-xl border border-dashed border-[#dbe6f3] bg-[#f8fbff] p-4">
            <h4 className="text-xs font-semibold uppercase text-[#94a3b8]">Documents · Projects · Payments</h4>
            <p className="text-xs text-[#64748b]">
              Document uploads and payment history will attach here once those modules are connected.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function Dt({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt className="text-xs uppercase text-[#94a3b8]">{label}</dt>
      <dd className="font-medium text-[#1e293b]">{value || "—"}</dd>
    </>
  );
}


