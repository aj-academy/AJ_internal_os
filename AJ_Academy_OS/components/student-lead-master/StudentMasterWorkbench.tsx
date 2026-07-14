"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TableHeaderCell, TableHeaderFilter } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { TablePagination } from "@/components/ui/TablePagination";
import { BulkSelectionBar } from "@/components/ui/BulkSelectionBar";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import { usePagination } from "@/lib/usePagination";
import { useRowSelection } from "@/lib/useRowSelection";
import { saveTaskLeadSelection } from "@/lib/taskLeadPickStorage";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/ui/LeadSummaryCard";
import { LeadStatusBadge, ProposalStatusBadge } from "@/components/student-lead-master/LeadStatusBadge";
import {
  ADMISSION_STATUSES,
  CRM_FOLLOW_UP_TYPES_UI,
  CRM_LEAD_STATUSES,
  CRM_PRIORITIES,
  CRM_PROPOSAL_STATUSES,
  CRM_SERVICES,
  CRM_SOURCES,
  CRM_TAB_IDS,
  LEAD_STAGES,
  NEW_PROGRAM_OPTION,
  PAYMENT_STATUSES,
  type CrmProposalStatus,
  type CrmTabId,
} from "@/components/student-lead-master/studentMasterConfig";
import { StudentLeadFormPanel, type StudentLeadFormValue } from "@/components/student-lead-master/StudentLeadFormPanel";
import {
  STUDENT_LEAD_SELECT,
  type CrmClientRow,
  displayLeadName,
  formatMoney,
  friendlyError,
  normalizeStatus,
} from "@/components/student-lead-master/studentMasterHelpers";
import {
  downloadStudentMasterImportTemplate,
  exportStudentMasterCsv,
  parseStudentMasterMatrix,
  studentMasterFileToMatrix,
  STUDENT_MASTER_DATA_COLUMN_COUNT,
} from "@/components/student-lead-master/studentMasterCsv";
import { formatDateTimeIST, formatDisplayDate } from "@/lib/datetime";
import { fetchInterestedPrograms, persistInterestedPrograms } from "@/lib/studentPrograms";
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

function emptyForm(assignedFallback: string, admin: boolean): StudentLeadFormValue {
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
    source: CRM_SOURCES[0],
    assigned_to: admin ? "" : assignedFallback,
    lead_stage: "",
    status: "New",
    priority: "Warm",
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
  const [whatsAppTemplates, setWhatsAppTemplates] = useState<string[]>([]);
  const [whatsAppComposeLead, setWhatsAppComposeLead] = useState<CrmClientRow | null>(null);
  const [whatsAppSubmitting, setWhatsAppSubmitting] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<string[]>([]);
  const [emailComposeLead, setEmailComposeLead] = useState<CrmClientRow | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [activityModalLead, setActivityModalLead] = useState<CrmClientRow | null>(null);
  const [activityModalRows, setActivityModalRows] = useState<ActivityRow[]>([]);
  const [activityModalLoading, setActivityModalLoading] = useState(false);

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

  const [overview, setOverview] = useState({
    total: 0,
    newLeads: 0,
    contacted: 0,
    interested: 0,
    proposalSent: 0,
    converted: 0,
    lost: 0,
    followToday: 0,
    overdue: 0,
    revenuePotential: 0,
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

  const buildClientsBaseQuery = useCallback(() => {
    let q = supabase.from("clients").select(STUDENT_LEAD_SELECT).order("updated_at", { ascending: false }).limit(300);
    if (!isAdmin) {
      q = q.eq("assigned_to", currentUserId);
    }
    return q.returns<CrmClientRow[]>();
  }, [currentUserId, isAdmin, supabase]);

  const loadClientsDataset = useCallback(async () => {
    const { data, error: loadError } = await buildClientsBaseQuery();
    if (loadError) throw new Error(loadError.message);
    setClients(data ?? []);
  }, [buildClientsBaseQuery]);

  const loadOverviewCounts = useCallback(async () => {
    async function counted(status?: string) {
      let qb = supabase.from("clients").select("id", { count: "exact", head: true });
      if (!isAdmin && currentUserId) qb = qb.eq("assigned_to", currentUserId);
      if (status) qb = qb.eq("status", status);
      return qb;
    }

    const [
      totalRes,
      newRes,
      newLegacyRes,
      contactedRes,
      interestedRes,
      feeDiscussedRes,
      convertedRes,
      admittedRes,
      lostRes,
      todayRes,
    ] = await Promise.all([
      counted(),
      counted("New"),
      counted("New Lead"),
      counted("Contacted"),
      counted("Interested"),
      counted("Fee Discussed"),
      counted("Converted"),
      counted("Admitted"),
      counted("Lost"),
      (async () => {
        const td = todayISO();
        let q = supabase.from("clients").select("id", { count: "exact", head: true }).eq("follow_up_date", td);
        if (!isAdmin && currentUserId) q = q.eq("assigned_to", currentUserId);
        return q;
      })(),
    ]);

    const errs = [
      totalRes.error,
      newRes.error,
      newLegacyRes.error,
      contactedRes.error,
      interestedRes.error,
      feeDiscussedRes.error,
      convertedRes.error,
      admittedRes.error,
      lostRes.error,
      todayRes.error,
    ].find(Boolean);
    if (errs) throw new Error(errs.message);

    const todayStr = todayISO();
    let overdueQ = supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .not("follow_up_date", "is", null)
      .lt("follow_up_date", todayStr)
      .not("status", "in", "(Converted,Admitted,Lost,Not Interested)");
    if (!isAdmin && currentUserId) overdueQ = overdueQ.eq("assigned_to", currentUserId);
    const overdueRes = await overdueQ;

    let revenueSum = 0;
    if (isAdmin) {
      const rv = await supabase
        .from("clients")
        .select("budget")
        .not("budget", "is", null)
        .not("status", "in", "(Converted,Admitted,Lost,Not Interested)");
      revenueSum =
        rv.data?.reduce((acc, row: { budget?: number | string | null }) => acc + Number(row.budget ?? 0), 0) ?? 0;
    }

    setOverview({
      total: totalRes.count ?? 0,
      newLeads: (newRes.count ?? 0) + (newLegacyRes.count ?? 0),
      contacted: contactedRes.count ?? 0,
      interested: interestedRes.count ?? 0,
      proposalSent: feeDiscussedRes.count ?? 0,
      converted: (convertedRes.count ?? 0) + (admittedRes.count ?? 0),
      lost: lostRes.count ?? 0,
      followToday: todayRes.count ?? 0,
      overdue: overdueRes.count ?? 0,
      revenuePotential: revenueSum,
    });
  }, [currentUserId, isAdmin, supabase]);

  const reload = useCallback(async () => {
    if (!currentUserId) return;
    setError(null);
    setLoading(true);
    try {
      const programs = await fetchInterestedPrograms(supabase);
      setInterestedPrograms(programs);
      const templates = await fetchWhatsAppTemplates(supabase);
      setWhatsAppTemplates(templates);
      const emailTpls = await fetchEmailTemplates(supabase);
      setEmailTemplates(emailTpls);
      await Promise.all([loadOverviewCounts(), loadClientsDataset()]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadClientsDataset, loadOverviewCounts, supabase]);

  /** Refresh clients + follow-ups + activities + overview without full-page loading spinner. */
  const silentRefreshCrm = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const { data, error: loadError } = await buildClientsBaseQuery();
      if (loadError) throw new Error(loadError.message);
      const next = data ?? [];
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
      await loadOverviewCounts();
    } catch (e) {
      setError(friendlyError(e));
      logDevSupabase("silentRefreshCrm", e);
    }
  }, [buildClientsBaseQuery, currentUserId, loadOverviewCounts, supabase]);

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

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
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
    filteredClients.forEach((c) => {
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
  }, [filteredClients]);

  const followRowsScoped = followRows.filter((f) => clientMap[f.client_id]);

  const patchClientLocal = useCallback((id: string, patch: Partial<CrmClientRow>) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setProfileLead((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  }, []);

  const canContactLead = useCallback(
    (lead: CrmClientRow) => isAdmin || lead.assigned_to === currentUserId,
    [currentUserId, isAdmin],
  );

  const handlePhoneClick = async (lead: CrmClientRow) => {
    if (!canContactLead(lead)) return;
    const phone = lead.phone?.trim();
    if (!phone) {
      setError("No mobile number on this student.");
      return;
    }
    const now = new Date().toISOString();
    patchClientLocal(lead.id, { phone_called: true, phone_called_at: now, last_contacted_at: now });
    window.location.href = `tel:${phone}`;
    const { error: updateError } = await supabase
      .from("clients")
      .update({ phone_called: true, phone_called_at: now, last_contacted_at: now })
      .eq("id", lead.id);
    if (updateError) {
      setError(updateError.message);
      await reload();
      return;
    }
    const activity: ActivityRow = {
      id: `local-${Date.now()}`,
      client_id: lead.id,
      activity_type: "Phone Call",
      notes: `Called ${phone}`,
      old_value: null,
      new_value: null,
      created_at: now,
      created_by: currentUserId,
    };
    setActivityRows((prev) => [activity, ...prev]);
    await insertActivityClient(supabase, lead.id, "Phone Call", `Called ${phone}`, currentUserId);
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
    const assignee = v.assigned_to.trim() || null;
    return {
      ...base,
      status: v.status,
      priority: v.priority || "Warm",
      lead_score: Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0,
      assigned_to: isDbAdmin ? assignee : assignee || currentUserId,
      assigned_by: currentUserId,
    };
  }

  const openCreate = () => {
    if (!canWriteOwnLeads) return;
    setSuccess(null);
    setError(null);
    setEditId(null);
    setForm(emptyForm(currentUserId, isDbAdmin));
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
    try {
      let saveForm = form;
      if (form.interested_program === NEW_PROGRAM_OPTION) {
        const programName = form.new_program_name.trim();
        if (!programName) throw new Error("Enter a name for the new program.");
        if (isDbAdmin) {
          const updated = await persistInterestedPrograms([...interestedPrograms, programName]);
          setInterestedPrograms(updated);
        }
        saveForm = { ...form, interested_program: programName, new_program_name: "" };
      }

      if (!isAdmin && editId) {
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
        const up = await supabase.from("clients").update(full).eq("id", editId);
        if (up.error) throw up.error;
        const prevStat = normalizeStatus(String(previous?.status ?? ""));
        const prevAss = previous?.assigned_to ? String(previous.assigned_to) : "";
        const newAss = form.assigned_to ? String(form.assigned_to) : "";
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
        if (!isDbAdmin) {
          payload.assigned_to = currentUserId;
          payload.assigned_by = currentUserId;
        } else {
          payload.assigned_by = currentUserId;
        }
        const inserted = await supabase
          .from("clients")
          .insert(payload)
          .select("id")
          .maybeSingle();

        if (inserted.error) throw inserted.error;
        const nid = inserted.data?.id as string | undefined;
        if (nid) await insertActivityClient(supabase, nid, "Lead Created", `Source ${form.source}`, currentUserId);
        setSuccess("Lead created.");
      }
      setPanelOpen(false);
      setEditId(null);
      await reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("Delete this lead permanently?")) return;
    const { error: deletionError } = await supabase.from("clients").delete().eq("id", id);
    if (deletionError) setError(deletionError.message);
    else {
      setSuccess("Deleted.");
      await reload();
    }
  };

  const handleBulkDeleteLeads = async () => {
    if (leadBulk.selectedCount === 0) return;
    if (!confirm(`Delete ${leadBulk.selectedCount} selected lead(s) permanently?`)) return;
    const ids = [...leadBulk.selected];
    let q = supabase.from("clients").delete().in("id", ids);
    if (!isAdmin && currentUserId) q = q.eq("assigned_to", currentUserId);
    const { error: deletionError } = await q;
    if (deletionError) {
      setError(deletionError.message);
      return;
    }
    leadBulk.clearSelection();
    setSuccess(`${ids.length} lead(s) deleted.`);
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
    const { data: inserted, error: insertError } = await supabase
      .from("tasks")
      .insert({
        title: `Student lead outreach (${ids.length} lead${ids.length === 1 ? "" : "s"})`,
        description: `Assigned from Student Master · ${ids.length} linked lead(s).`,
        assigned_to: bulkAssignTo,
        assigned_by: currentUserId,
        assignment_type: "lead",
        client_ids: ids,
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
    // Do NOT set clients.assigned_to — ownership stays admin/counsellor; work happens via the task.
    try {
      await supabase.rpc("create_task_assignment_notification", { p_task_id: inserted.id });
    } catch {
      /* optional RPC */
    }
    leadBulk.clearSelection();
    setBulkAssignTo("");
    setSuccess(
      `${ids.length} lead(s) sent to ${label} as a My Tasks → Student Lead assignment (Task Assignment).`,
    );
    await reload();
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
  };

  const saveProposalFromModal = async () => {
    if (!proposalModalLead?.id || !currentUserId) return;
    if (!isAdmin) {
      setError("Only admins can update proposals from the tracker.");
      return;
    }
    setProposalSubmitting(true);
    setError(null);
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
        proposal_link: proposalDraft.proposal_link.trim() || null,
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
      setSuccess("Proposal saved.");
      await silentRefreshCrm();
    } catch (e) {
      setError(friendlyError(e));
      logDevSupabase("saveProposalFromModal", e);
    } finally {
      setProposalSubmitting(false);
    }
  };

  const todayFollowUps = followRowsScoped.filter((f) => f.follow_up_date === todayISO());

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

      for (const payload of payloads) {
        const { error: insertError } = await supabase.from("clients").insert(payload);
        if (insertError) {
          fail += 1;
          rowErrors.push(insertError.message);
        } else {
          ok += 1;
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
          <p className="mt-1 text-sm text-[#64748b]">Manage student leads, counselling follow-ups, fees and admissions.</p>
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

      {pickForTask ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c9a227] bg-[#fef3c7] px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-[#92400e]">Selecting leads for task assignment</p>
            <p className="text-xs text-[#78350f]">
              Tab: {tabLabels[activeTab]} · {pickedLeadIds.size} selected · use any sub-category tab above
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
            employeeOptions={employeesForSelect}
            canContactLead={canContactLead}
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

      {["pipeline", "converted", "proposal"].includes(activeTab) ? (
        <TableSearchBar
          value={searchText}
          onChange={setSearchText}
          placeholder="Search name, email, phone, company…"
          showClear={filtersActive}
          onClear={clearTableFilters}
          hint={`Showing ${filteredClients.length} of ${clients.length} lead(s)`}
        />
      ) : null}

      {activeTab === "follow-ups" && (
        <>
          <div className="stat-cards-grid">
            <LeadSummaryCard title="Today" value={todayFollowUps.length} loading={loading} />
            <LeadSummaryCard title="Overdue snapshot" value={overview.overdue} loading={loading} accent="rose" />
            <LeadSummaryCard title="Rows tracked" value={followRowsScoped.length} loading={loading} />
            <LeadSummaryCard
              title="Completed"
              value={followRowsScoped.filter((followRowEntry) => followRowEntry.status === "Completed").length}
              loading={loading}
            />
          </div>
          <FollowUpsTable
            rows={followRowsScoped}
            clientMap={clientMap}
            employeeNameMap={employeeNameMap}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onComplete={(fr) => void markFollowCompleted(fr)}
          />
        </>
      )}

      {activeTab === "pipeline" && (
        <PipelineBoard leads={filteredClients} isAdmin={isAdmin} onChangeStatus={(r, ns) => void changePipelineStatus(r, ns)} />
      )}

      {activeTab === "converted" && (
        <>
          {renderLeadBulkBar}
        <ConvertedTable
          leads={filteredClients.filter((leadEntry) => {
            const st = normalizeStatus(String(leadEntry.status));
            return st === "Converted" || st === "Admitted";
          })}
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
            Track and update proposal fields on each lead. Changes save to the lead record and appear in Activity Timeline.
          </p>
          <ProposalTrackerTable leads={filteredClients} isAdmin={isAdmin} onEdit={(leadRow) => openProposalModal(leadRow)} bulkSelection={leadBulkSelectionProps} />
          {proposalModalLead ? (
            <ProposalEditModal
              lead={proposalModalLead}
              draft={proposalDraft}
              setDraft={setProposalDraft}
              submitting={proposalSubmitting}
              onClose={() => setProposalModalLead(null)}
              onSave={() => void saveProposalFromModal()}
            />
          ) : null}
        </>
      )}

      {activeTab === "timeline" && (
        <ActivityTable rows={activityRows} clientMap={clientMap} employeeNameMap={employeeNameMap} loading={loading} />
      )}

      {activeTab === "reports" && (
        <ReportsPanel
          leads={filteredClients}
          followRows={followRowsScoped}
          isAdmin={isAdmin}
          employeeNameMap={employeeNameMap}
        />
      )}

      {activeTab === "settings" && <CrmSettingsPanel />}

      {panelOpen && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setPanelOpen(false)} />
          <div className="fixed inset-0 z-50 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[540px] lg:max-w-[100vw]">
            <StudentLeadFormPanel
              title={editId ? (isAdmin ? "Edit student" : "Update student") : "Add student"}
              open={panelOpen}
              value={form}
              programOptions={interestedPrograms}
              employees={employeesForSelect}
              canAssign={isAdmin}
              submitting={submitting}
              onChange={setForm}
              onClose={() => setPanelOpen(false)}
              onSubmit={() => void handleSave()}
            />
          </div>
        </>
      )}

      {profileLead ? (
        <ProfileModal lead={profileLead} onClose={() => setProfileLead(null)} employeeMap={employeeNameMap} follows={followRows.filter((followRowRecord) => followRowRecord.client_id === profileLead.id)} activities={activityRows.filter((aRow) => aRow.client_id === profileLead.id)} />
      ) : null}

      {followModalFor ? (
        <QuickFollowModal draft={followDraft} setDraft={setFollowDraft} submitting={submitting} target={followModalFor} onClose={() => setFollowModalFor(null)} onSave={() => void saveFollowQuick()} />
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
  isAdmin,
  currentUserId,
  onComplete,
}: {
  rows: FollowRow[];
  clientMap: Record<string, CrmClientRow>;
  employeeNameMap: Record<string, string>;
  isAdmin: boolean;
  currentUserId: string;
  onComplete: (r: FollowRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
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
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-6 py-12 text-center text-[#64748b]">
                No follow-ups loaded yet. Add one from All Leads → Follow-up, or ensure follow-up rows exist for your visible leads.
              </td>
            </tr>
          ) : null}
          {rows.map((fr) => {
            const cli = clientMap[fr.client_id];
            if (!cli) return null;
            const canTouch = isAdmin || cli.assigned_to === currentUserId;
            return (
              <tr key={fr.id}>
                <td className="px-3 py-2 font-semibold text-slate-900">{displayLeadName(cli)}</td>
                <td className="max-w-[180px] truncate px-3 py-2">{cli.company_name || "—"}</td>
                <td>{cli.assigned_to ? employeeNameMap[cli.assigned_to] ?? "-" : "-"}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDisplayDate(fr.follow_up_date)}</td>
                <td className="whitespace-nowrap">{fr.follow_up_time || "—"}</td>
                <td>{fr.follow_up_type || "—"}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-600">{fr.notes || "—"}</td>
                <td>{fr.status || "Pending"}</td>
                <td className="px-3 py-2 text-right">
                  {canTouch && fr.status !== "Completed" ? (
                    <button type="button" className="text-xs font-semibold text-emerald-600 hover:underline" onClick={() => onComplete(fr)}>
                      Done
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PipelineBoard({
  leads,
  isAdmin,
  onChangeStatus,
}: {
  leads: CrmClientRow[];
  isAdmin: boolean;
  onChangeStatus: (r: CrmClientRow, s: string) => void;
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-h-[340px] min-w-[980px] gap-3">
        {CRM_LEAD_STATUSES.map((statusCol) => {
          const colLeads = leads.filter((l) => normalizeStatus(String(l.status)) === statusCol);
          return (
            <div key={statusCol} className="min-w-[240px] flex-1 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#475569]">
                {statusCol} · {colLeads.length}
              </p>
              <div className="space-y-3">
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
                        {CRM_LEAD_STATUSES.map((opt) => (
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
  const thCls = "px-6 py-3.5 text-center align-middle min-w-[10.5rem]";
  const tdCls = "whitespace-nowrap px-6 py-3.5 text-center align-middle";
  const tdTrunc = "max-w-[160px] truncate px-6 py-3.5 text-center align-middle";
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <div className="overflow-x-auto">
      <table className="table-freeze-cols w-full min-w-[5200px] text-sm" style={{ ["--sticky-col-2" as string]: "14rem" }}>
        <thead className="bg-[#f1f6fc] text-[#64748b]">
          <tr>
            {pickMode ? <TableHeaderCell label="Pick" className={`${thCls} sticky-col sticky-col-1 min-w-[4.5rem]`} /> : null}
            {showBulk ? (
              <th className={`w-12 px-6 py-3.5 text-center align-middle sticky-col ${pickMode ? "sticky-col-after-check" : "sticky-col-1"}`}>
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
              className={`${thCls} sticky-col ${
                pickMode || showBulk ? "sticky-col-after-check-2" : "sticky-col-2"
              } min-w-[11rem]`}
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
              options={CRM_SOURCES.map((s) => ({ value: s, label: s }))}
              allLabel="All sources"
              className={thCls}
            />
            <TableHeaderFilter
              label="Assigned Counsellor"
              value={fltAssigned}
              onChange={setFltAssigned}
              options={employeeOptions.map((e) => ({ value: e.id, label: e.label }))}
              allLabel="All counsellors"
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
              options={CRM_LEAD_STATUSES.map((s) => ({ value: s, label: s }))}
              allLabel="All statuses"
              className={thCls}
            />
            <TableHeaderFilter
              label="Priority"
              value={fltPriority}
              onChange={setFltPriority}
              options={CRM_PRIORITIES.map((p) => ({ value: p, label: p }))}
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
                  <td colSpan={colCount} className="px-6 py-3.5 text-center align-middle">
                    <div className="h-5 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            : leads.map((lead) => {
                const fu = lead.follow_up_date ? String(lead.follow_up_date) : null;
                const overdue = !!(fu && fu < today && !isClosedLeadStatus(String(lead.status || "")));
                const hot = lead.priority === "Hot";
                const program = lead.interested_program || lead.service_interest || "—";
                const contactable = canContactLead(lead);
                return (
                  <tr
                    key={lead.id}
                    className={[
                      overdue ? "bg-rose-50/80" : "",
                      hot ? "outline outline-2 outline-orange-200/70" : "",
                      fu === today ? "shadow-[inset_3px_0_0_#c9a227]" : "",
                    ].join(" ")}
                  >
                    {pickMode ? (
                      <td className="sticky-col sticky-col-1 w-12 px-6 py-3.5 text-center align-middle">
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
                      <td className={`sticky-col w-12 px-6 py-3.5 text-center align-middle ${pickMode ? "sticky-col-after-check" : "sticky-col-1"}`}>
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
                      className={`sticky-col whitespace-nowrap px-6 py-3.5 text-center align-middle font-semibold text-slate-900 min-w-[14rem] ${
                        pickMode || showBulk ? "sticky-col-after-check" : "sticky-col-1"
                      }`}
                    >
                      {displayLeadName(lead) || "—"}
                    </td>
                    <td
                      className={`sticky-col whitespace-nowrap px-6 py-3.5 text-center align-middle min-w-[11rem] ${
                        pickMode || showBulk ? "sticky-col-after-check-2" : "sticky-col-2"
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
                    <td className="whitespace-nowrap px-6 py-3.5 text-center align-middle">
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
                    <td className="px-6 py-3.5 text-center align-middle">
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
                    <td className="px-6 py-3.5 text-center align-middle">
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
                    <td className="min-w-[14rem] whitespace-nowrap px-6 py-3.5 text-center align-middle text-xs">
                      <div className="inline-flex flex-wrap items-center justify-center gap-3">
                        <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onProfile(lead)}>
                          View
                        </button>
                        {(isAdmin || lead.assigned_to === currentUserId) && (
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
  const showBulk = Boolean(bulkSelection);
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-[#f1f6fc] text-[#64748b]">
          <tr>
            {showBulk ? (
              <th className="w-10 px-3 py-2">
                <TableBulkCheckbox
                  checked={bulkSelection!.allSelected}
                  indeterminate={bulkSelection!.someSelected}
                  disabled={!leads.length}
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
          {leads.map((convertedLead) => (
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
              <td>{convertedLead.proposal_amount != null ? `₹${Number(convertedLead.proposal_amount).toLocaleString()}` : "—"}</td>
              <td>{convertedLead.converted_at ? new Date(String(convertedLead.converted_at)).toLocaleDateString() : "—"}</td>
              <td>{convertedLead.assigned_to ? employeeNameMap[convertedLead.assigned_to] : "—"}</td>
              <td className="space-x-2 px-3 py-2 text-right text-xs">
                <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onProfile(convertedLead)}>
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
  const showBulk = Boolean(bulkSelection);
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="bg-[#f1f6fc] text-[#64748b]">
          <tr>
            {showBulk ? (
              <th className="w-10 px-3 py-2">
                <TableBulkCheckbox
                  checked={bulkSelection!.allSelected}
                  indeterminate={bulkSelection!.someSelected}
                  disabled={!leads.length}
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
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Proposal link</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan={showBulk ? 8 : 7} className="px-6 py-12 text-center text-[#64748b]">
                No leads match the current filters. Adjust filters on the All Leads tab or add a lead.
              </td>
            </tr>
          ) : (
            leads.map((proposalLead) => (
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
                  {proposalLead.proposal_amount != null ? `₹${Number(proposalLead.proposal_amount).toLocaleString()}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <ProposalStatusBadge status={String(proposalLead.proposal_status)} />
                </td>
                <td className="whitespace-nowrap px-3 py-2">{proposalLead.proposal_sent_date || "—"}</td>
                <td className="px-3 py-2">
                  {proposalLead.proposal_link ? (
                    <a
                      href={String(proposalLead.proposal_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      Open
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isAdmin ? (
                    <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => onEdit(proposalLead)}>
                      Update
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Admin only</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function ProposalEditModal({
  lead,
  draft,
  setDraft,
  onClose,
  onSave,
  submitting,
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
}) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={onClose} />
      <div className="fixed left-4 right-4 top-[8%] z-[61] mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-[20px] border border-[#e8dcc8] bg-white p-6 shadow-2xl sm:left-auto sm:right-10">
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
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[#64748b]">Proposal link</span>
            <Input value={draft.proposal_link} onChange={(e) => setDraft((d) => ({ ...d, proposal_link: e.target.value }))} className="rounded-lg border-[#dbe6f3]" />
          </label>
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
        <div className="mt-6 flex justify-end gap-2">
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
      <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
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

function CrmSettingsPanel() {
  const block = (title: string, description: string, items: readonly string[]) => (
    <article className="flex flex-col rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <h4 className="text-sm font-semibold text-[#0f172a]">{title}</h4>
      <p className="mt-1 text-xs leading-relaxed text-[#64748b]">{description}</p>
      <ul className="mt-3 max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-xs text-[#475569]">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-blue-100 bg-[#f8fbff] p-5">
        <h3 className="text-base font-semibold text-[#0f172a]">CRM configuration</h3>
        <p className="mt-2 text-sm text-[#64748b]">
          These lists define what your team sees in dropdowns when adding or editing leads. They are <strong>static</strong> in the app for now.
        </p>
        <p className="mt-2 text-xs font-medium text-blue-800">Coming soon: editable CRM settings stored in Supabase (e.g. system_settings).</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {block("Lead sources", "Where new business originates. Used in the Add Lead form.", CRM_SOURCES)}
        {block("Lead statuses", "Pipeline stages from first touch through close.", CRM_LEAD_STATUSES)}
        {block("Service interests", "Services Birthmark Brahma offers; multi-select on leads.", CRM_SERVICES)}
        {block("Follow-up types", "How the next touch is planned (call, message, meeting, email).", CRM_FOLLOW_UP_TYPES_UI)}
        {block("Priority types", "Deal temperature for triage.", CRM_PRIORITIES)}
        {block(
          "Default lead owner",
          "When adding a lead, admins pick assignee; employees default to themselves. Persisted per-lead on the client row.",
          ["Configured per lead in Add / Edit Lead (Assigned To)."],
        )}
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
}: {
  target: CrmClientRow;
  draft: { date: string; time: string; type: string; notes: string };
  setDraft: Dispatch<SetStateAction<{ date: string; time: string; type: string; notes: string }>>;
  onClose: () => void;
  onSave: () => void;
  submitting: boolean;
}) {
  useEffect(() => {
    const t = typeof target.follow_up_time === "string" ? target.follow_up_time.slice(0, 5) : "";
    setDraft({
      date: (typeof target.follow_up_date === "string" ? target.follow_up_date.slice(0, 10) : "") || "",
      time: t,
      type: (target.follow_up_type as string | null | undefined)?.trim() || "Call",
      notes: "",
    });
  }, [target.id, setDraft, target.follow_up_date, target.follow_up_time, target.follow_up_type]);

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
              {CRM_FOLLOW_UP_TYPES_UI.map((ft) => (
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


