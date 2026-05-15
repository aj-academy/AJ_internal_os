"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadSummaryCard } from "@/components/client-lead/LeadSummaryCard";
import { LeadStatusBadge, ProposalStatusBadge } from "@/components/client-lead/LeadStatusBadge";
import {
  CRM_FOLLOW_UP_TYPES_UI,
  CRM_LEAD_STATUSES,
  CRM_PRIORITIES,
  CRM_PROPOSAL_STATUSES,
  CRM_SERVICES,
  CRM_SOURCES,
  CRM_TAB_IDS,
  type CrmProposalStatus,
  type CrmTabId,
} from "@/components/client-lead/crmConfig";
import { CrmLeadFormPanel, type CrmLeadFormValue } from "@/components/client-lead/CrmLeadFormPanel";
import {
  CRM_CLIENT_SELECT,
  type CrmClientRow,
  displayLeadName,
  friendlyError,
  normalizeStatus,
} from "@/components/client-lead/crmHelpers";

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

function emptyForm(assignedFallback: string, admin: boolean): CrmLeadFormValue {
  return {
    lead_name: "",
    company_name: "",
    phone: "",
    whatsapp: "",
    email: "",
    city: "",
    industry: "",
    source: CRM_SOURCES[0],
    service_interests: new Set<string>(),
    requirement: "",
    budget: "",
    expected_start_date: "",
    notes: "",
    status: "New Lead",
    priority: "Warm",
    lead_score: "0",
    assigned_to: admin ? "" : assignedFallback,
    follow_up_date: "",
    follow_up_time: "",
    follow_up_type: "",
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
    "proposal_status",
    "proposal_amount",
    "proposal_sent_date",
    "proposal_link",
    "quotation_link",
    "agreement_link",
    "service_interest",
  ];
  const out: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (key in base) out[key] = base[key];
  });
  return out;
}

export function CrmWorkbench({ role }: { role: AppRole }) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = role === "admin";

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
  const [fltService, setFltService] = useState("");
  const [fltAssigned, setFltAssigned] = useState("");
  const [fltFollowFrom, setFltFollowFrom] = useState("");
  const [fltFollowTo, setFltFollowTo] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    status: "",
    source: "",
    priority: "",
    service: "",
    assigned: "",
    followFrom: "",
    followTo: "",
  });

  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CrmLeadFormValue>(() => emptyForm("", true));

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
      })),
    [employees],
  );

  const buildClientsBaseQuery = useCallback(() => {
    let q = supabase.from("clients").select(CRM_CLIENT_SELECT).order("updated_at", { ascending: false }).limit(800);
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
      contactedRes,
      interestedRes,
      proposalRes,
      convertedRes,
      lostRes,
      todayRes,
    ] = await Promise.all([
      counted(),
      counted("New Lead"),
      counted("Contacted"),
      counted("Interested"),
      counted("Proposal Sent"),
      counted("Converted"),
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
      contactedRes.error,
      interestedRes.error,
      proposalRes.error,
      convertedRes.error,
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
      .not("status", "in", "(Converted,Lost,Not Interested)");
    if (!isAdmin && currentUserId) overdueQ = overdueQ.eq("assigned_to", currentUserId);
    const overdueRes = await overdueQ;

    let revenueSum = 0;
    if (isAdmin) {
      const rv = await supabase
        .from("clients")
        .select("budget")
        .not("budget", "is", null)
        .not("status", "in", "(Converted,Lost,Not Interested)");
      revenueSum =
        rv.data?.reduce((acc, row: { budget?: number | string | null }) => acc + Number(row.budget ?? 0), 0) ?? 0;
    }

    setOverview({
      total: totalRes.count ?? 0,
      newLeads: newRes.count ?? 0,
      contacted: contactedRes.count ?? 0,
      interested: interestedRes.count ?? 0,
      proposalSent: proposalRes.count ?? 0,
      converted: convertedRes.count ?? 0,
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
      await Promise.all([loadOverviewCounts(), loadClientsDataset()]);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [currentUserId, loadClientsDataset, loadOverviewCounts]);

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
    const query = appliedFilters.search.trim().toLowerCase();
    if (query) {
      list = list.filter((c) =>
        `${displayLeadName(c)} ${c.company_name ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(
          query,
        ),
      );
    }
    if (appliedFilters.status) list = list.filter((c) => normalizeStatus(String(c.status)) === appliedFilters.status);
    if (appliedFilters.source) list = list.filter((c) => (c.source || "") === appliedFilters.source);
    if (appliedFilters.priority) list = list.filter((c) => (c.priority || "") === appliedFilters.priority);
    if (appliedFilters.service)
      list = list.filter((c) =>
        servicesFromCsv(String(c.service_interest ?? "")).includes(appliedFilters.service),
      );
    if (appliedFilters.assigned) list = list.filter((c) => (c.assigned_to || "") === appliedFilters.assigned);
    if (appliedFilters.followFrom) list = list.filter((c) => (c.follow_up_date || "") >= appliedFilters.followFrom);
    if (appliedFilters.followTo) list = list.filter((c) => !c.follow_up_date || (c.follow_up_date || "") <= appliedFilters.followTo);
    return list;
  }, [appliedFilters, clients]);

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

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

  const applyFilters = () => {
    setAppliedFilters({
      search: searchText,
      status: fltStatus,
      source: fltSource,
      priority: fltPriority,
      service: fltService,
      assigned: fltAssigned,
      followFrom: fltFollowFrom,
      followTo: fltFollowTo,
    });
  };

  const resetFilters = () => {
    setSearchText("");
    setFltStatus("");
    setFltSource("");
    setFltPriority("");
    setFltService("");
    setFltAssigned("");
    setFltFollowFrom("");
    setFltFollowTo("");
    setAppliedFilters({
      search: "",
      status: "",
      source: "",
      priority: "",
      service: "",
      assigned: "",
      followFrom: "",
      followTo: "",
    });
  };

  function rowToForm(lead: CrmClientRow): CrmLeadFormValue {
    const interests = servicesFromCsv(String(lead.service_interest ?? ""));
    return {
      lead_name: displayLeadName(lead) || String(lead.name ?? ""),
      company_name: lead.company_name ?? "",
      phone: lead.phone ?? "",
      whatsapp: lead.whatsapp ?? "",
      email: lead.email ?? "",
      city: lead.city ?? "",
      industry: lead.industry ?? "",
      source: (lead.source as string) || CRM_SOURCES[0],
      service_interests: new Set(interests),
      requirement: lead.requirement ?? "",
      budget: lead.budget != null ? String(lead.budget) : "",
      expected_start_date: lead.expected_start_date ?? "",
      notes: lead.notes ?? "",
      status: normalizeStatus(String(lead.status)),
      priority: lead.priority ?? "Warm",
      lead_score: lead.lead_score != null ? String(lead.lead_score) : "0",
      assigned_to: lead.assigned_to ?? "",
      follow_up_date: lead.follow_up_date ?? "",
      follow_up_time: (lead.follow_up_time as string) ?? "",
      follow_up_type: lead.follow_up_type ?? "",
      proposal_status: (lead.proposal_status as CrmProposalStatus) ?? "Not Sent",
      proposal_amount: lead.proposal_amount != null ? String(lead.proposal_amount) : "",
      proposal_sent_date: lead.proposal_sent_date ?? "",
      proposal_link: lead.proposal_link ?? "",
      quotation_link: lead.quotation_link ?? "",
      agreement_link: lead.agreement_link ?? "",
    };
  }

  function buildPayload(v: CrmLeadFormValue, opts: { full: boolean }) {
    const nm = v.lead_name.trim();
    const base: Record<string, unknown> = {
      lead_name: nm,
      name: nm,
      company_name: v.company_name.trim() || null,
      phone: v.phone.trim() || null,
      whatsapp: v.whatsapp.trim() || null,
      email: v.email.trim() || null,
      city: v.city.trim() || null,
      industry: v.industry.trim() || null,
      source: v.source.trim() || null,
      service_interest: csvServices(v.service_interests) || null,
      requirement: v.requirement.trim() || null,
      budget: v.budget.trim() === "" ? null : Number(v.budget),
      expected_start_date: v.expected_start_date || null,
      notes: v.notes.trim() || null,
      follow_up_date: v.follow_up_date || null,
      follow_up_time: v.follow_up_time || null,
      follow_up_type: v.follow_up_type || null,
      proposal_status: v.proposal_status || "Not Sent",
      proposal_amount: v.proposal_amount.trim() === "" ? null : Number(v.proposal_amount),
      proposal_sent_date: v.proposal_sent_date || null,
      proposal_link: v.proposal_link.trim() || null,
      quotation_link: v.quotation_link.trim() || null,
      agreement_link: v.agreement_link.trim() || null,
    };

    if (!opts.full)
      return {
        ...base,
        assigned_to: isAdmin ? (v.assigned_to || null) : currentUserId,
      };

    const scoreRaw = Number(v.lead_score);
    return {
      ...base,
      status: v.status,
      priority: v.priority || "Warm",
      lead_score: Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0,
      assigned_to: isAdmin ? (v.assigned_to || null) : currentUserId,
      assigned_by: isAdmin ? currentUserId : null,
    };
  }

  const openCreate = () => {
    if (!isAdmin) return;
    setSuccess(null);
    setError(null);
    setEditId(null);
    setForm(emptyForm(currentUserId, true));
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!currentUserId) return;
    if (!isAdmin && !editId) {
      setError("Only admins can create leads.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!isAdmin && editId) {
        const base = buildPayload(form, { full: false }) as Record<string, unknown>;
        const limited = pickEmployeePayload(base);
        const previous = clients.find((cRow) => cRow.id === editId);
        const up = await supabase.from("clients").update(limited).eq("id", editId).eq("assigned_to", currentUserId);
        if (up.error) throw up.error;
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
        if (previous && (prevP.st !== newP.st || prevP.am !== newP.am || prevP.sd !== newP.sd)) {
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
        const full = buildPayload(form, { full: true }) as Record<string, unknown>;
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
      } else if (!editId && isAdmin) {
        const inserted = await supabase
          .from("clients")
          .insert({
            ...(buildPayload(form, { full: true }) as Record<string, unknown>),
            assigned_by: currentUserId,
          })
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

  const convertLead = async (leadRow: CrmClientRow) => {
    if (!isAdmin) return;
    const year = new Date().getFullYear();
    const { count } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "Converted");

    const nextCode =
      leadRow.client_code?.trim() || `BB-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const { error: updateError } = await supabase
      .from("clients")
      .update({
        status: "Converted",
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
        "Converted to Client",
        `Assigned client code ${nextCode}`,
        currentUserId,
      );
    } catch (e) {
      logDevSupabase("convertLead.activity", e);
      setError(`Converted, but timeline log failed: ${friendlyError(e)}`);
    }
    setSuccess("Converted.");
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

  const tabLabels: Record<CrmTabId, string> = {
    overview: "Overview",
    "all-leads": "All Leads",
    "follow-ups": "Follow-ups",
    pipeline: "Pipeline",
    converted: "Converted Clients",
    proposal: "Proposal Tracker",
    timeline: "Activity Timeline",
    reports: "Reports",
    settings: "Settings",
  };

  return (
    <section className="space-y-5 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Client / Lead Master</h2>
          <p className="mt-1 text-sm text-[#64748b]">Manage leads, clients, follow-ups, proposals and deal pipeline.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void reload()}
            className="h-9 rounded-full border-[#cfdceb] bg-[#f8fbff]"
          >
            Refresh
          </Button>
          {isAdmin ? (
            <Button data-requires-online onClick={openCreate} className="h-9 rounded-full bg-[#2563eb] px-5 text-white hover:bg-[#1d4ed8]">
              + Add Lead
            </Button>
          ) : null}
        </div>
      </header>

      {error ? <Banner tone="error" message={error} /> : null}
      {success ? <Banner tone="success" message={success} /> : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {CRM_TAB_IDS.map((tabId) => (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId)}
              className={
                activeTab === tabId
                  ? "rounded-xl bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white shadow-md"
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <LeadSummaryCard title="Total Leads" value={overview.total} loading={loading} />
            <LeadSummaryCard title="New Leads" value={overview.newLeads} loading={loading} />
            <LeadSummaryCard title="Contacted" value={overview.contacted} loading={loading} />
            <LeadSummaryCard title="Interested" value={overview.interested} loading={loading} />
            <LeadSummaryCard title="Proposal Sent" value={overview.proposalSent} loading={loading} />
            <LeadSummaryCard title="Converted Clients" value={overview.converted} loading={loading} />
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

      {["all-leads", "pipeline", "converted", "proposal"].includes(activeTab) && (
        <FiltersBar
          searchText={searchText}
          setSearchText={setSearchText}
          fltStatus={fltStatus}
          setFltStatus={setFltStatus}
          fltSource={fltSource}
          setFltSource={setFltSource}
          fltPriority={fltPriority}
          setFltPriority={setFltPriority}
          fltService={fltService}
          setFltService={setFltService}
          fltAssigned={fltAssigned}
          setFltAssigned={setFltAssigned}
          fltFollowFrom={fltFollowFrom}
          setFltFollowFrom={setFltFollowFrom}
          fltFollowTo={fltFollowTo}
          setFltFollowTo={setFltFollowTo}
          isAdmin={isAdmin}
          employeeOptions={employeesForSelect}
          onApply={applyFilters}
          onReset={resetFilters}
        />
      )}

      {activeTab === "all-leads" && (
        <AllLeadsTable
          loading={loading}
          leads={filteredClients}
          employeeNameMap={employeeNameMap}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
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
        />
      )}

      {activeTab === "follow-ups" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <ConvertedTable leads={filteredClients.filter((leadEntry) => normalizeStatus(String(leadEntry.status)) === "Converted")} employeeNameMap={employeeNameMap} isAdmin={isAdmin} onProfile={setProfileLead} />
      )}

      {activeTab === "proposal" && (
        <>
          <p className="text-sm text-[#64748b]">
            Track and update proposal fields on each lead. Changes save to the lead record and appear in Activity Timeline.
          </p>
          <ProposalTrackerTable leads={filteredClients} isAdmin={isAdmin} onEdit={(leadRow) => openProposalModal(leadRow)} />
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
            <CrmLeadFormPanel
              title={editId ? (isAdmin ? "Edit lead" : "Update lead") : "Add lead"}
              open={panelOpen}
              value={form}
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
        : "bg-[#2563eb]";
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

function FiltersBar(props: {
  searchText: string;
  setSearchText: (s: string) => void;
  fltStatus: string;
  setFltStatus: (s: string) => void;
  fltSource: string;
  setFltSource: (s: string) => void;
  fltPriority: string;
  setFltPriority: (s: string) => void;
  fltService: string;
  setFltService: (s: string) => void;
  fltAssigned: string;
  setFltAssigned: (s: string) => void;
  fltFollowFrom: string;
  setFltFollowFrom: (s: string) => void;
  fltFollowTo: string;
  setFltFollowTo: (s: string) => void;
  isAdmin: boolean;
  employeeOptions: { id: string; label: string }[];
  onApply: () => void;
  onReset: () => void;
}) {
  const {
    searchText,
    setSearchText,
    fltStatus,
    setFltStatus,
    fltSource,
    setFltSource,
    fltPriority,
    setFltPriority,
    fltService,
    setFltService,
    fltAssigned,
    setFltAssigned,
    fltFollowFrom,
    setFltFollowFrom,
    fltFollowTo,
    setFltFollowTo,
    isAdmin,
    employeeOptions,
    onApply,
    onReset,
  } = props;

  const selectClass =
    "h-11 w-full rounded-xl border border-[#d4deea] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#2563eb] sm:h-9";

  return (
    <article className="rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <Input placeholder="Search name/email/phone/company" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="h-11 border-[#d4deea] sm:h-9" />
        </div>
        <select className={selectClass} value={fltStatus} onChange={(e) => setFltStatus(e.target.value)}>
          <option value="">Status</option>
          {CRM_LEAD_STATUSES.map((sOpt) => (
            <option key={sOpt} value={sOpt}>
              {sOpt}
            </option>
          ))}
        </select>
        <select className={selectClass} value={fltSource} onChange={(e) => setFltSource(e.target.value)}>
          <option value="">Source</option>
          {CRM_SOURCES.map((sOpt) => (
            <option key={sOpt} value={sOpt}>
              {sOpt}
            </option>
          ))}
        </select>
        <select className={selectClass} value={fltPriority} onChange={(e) => setFltPriority(e.target.value)}>
          <option value="">Priority</option>
          {CRM_PRIORITIES.map((pOpt) => (
            <option key={pOpt} value={pOpt}>
              {pOpt}
            </option>
          ))}
        </select>
        <select className={selectClass} value={fltService} onChange={(e) => setFltService(e.target.value)}>
          <option value="">Service interest</option>
          {CRM_SERVICES.map((svc) => (
            <option key={svc} value={svc}>
              {svc}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          value={fltAssigned}
          onChange={(e) => setFltAssigned(e.target.value)}
          disabled={!isAdmin}
        >
          <option value="">Assigned</option>
          {employeeOptions.map((empOpt) => (
            <option key={empOpt.id} value={empOpt.id}>
              {empOpt.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Input type="date" value={fltFollowFrom} onChange={(e) => setFltFollowFrom(e.target.value)} className="h-11 border-[#d4deea] sm:h-9" />
          <Input type="date" value={fltFollowTo} onChange={(e) => setFltFollowTo(e.target.value)} className="h-11 border-[#d4deea] sm:h-9" />
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="button" className="h-11 flex-1 rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8] sm:h-9" onClick={onApply}>
            Apply filters
          </Button>
          <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl border-[#c9d8eb] sm:h-9" onClick={onReset}>
            Reset
          </Button>
        </div>
      </div>
    </article>
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
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Lead</th>
            <th className="px-4 py-3 text-left">Company</th>
            <th className="px-4 py-3 text-left">Owner</th>
            <th className="px-4 py-3 text-left">Date</th>
            <th className="px-4 py-3 text-left">Time</th>
            <th className="px-4 py-3 text-left">Type</th>
            <th className="px-4 py-3 text-left">Notes</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
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
                <td className="px-4 py-3 font-semibold text-slate-900">{displayLeadName(cli)}</td>
                <td className="max-w-[180px] truncate px-4 py-3">{cli.company_name || "—"}</td>
                <td>{cli.assigned_to ? employeeNameMap[cli.assigned_to] ?? "-" : "-"}</td>
                <td className="whitespace-nowrap px-4 py-3">{fr.follow_up_date || "—"}</td>
                <td className="whitespace-nowrap">{fr.follow_up_time || "—"}</td>
                <td>{fr.follow_up_type || "—"}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">{fr.notes || "—"}</td>
                <td>{fr.status || "Pending"}</td>
                <td className="px-4 py-3 text-right">
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
                      <p className="truncate">Follow-up {card.follow_up_date || "—"}</p>
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

function AllLeadsTable({
  loading,
  leads,
  employeeNameMap,
  isAdmin,
  currentUserId,
  onProfile,
  onEdit,
  onDelete,
  onAddFollow,
  onConvert,
}: {
  loading: boolean;
  leads: CrmClientRow[];
  employeeNameMap: Record<string, string>;
  isAdmin: boolean;
  currentUserId: string;
  onProfile: (l: CrmClientRow) => void;
  onEdit: (l: CrmClientRow) => void;
  onDelete: (id: string) => void;
  onAddFollow: (l: CrmClientRow) => void;
  onConvert: (l: CrmClientRow) => void;
}) {
  const today = todayISO();
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <table className="w-full min-w-[1400px] text-sm">
        <thead className="bg-[#f1f6fc] text-[#64748b]">
          <tr>
            {[
              "Lead",
              "Company",
              "Phone",
              "WhatsApp",
              "Email",
              "Source",
              "Services",
              "Status",
              "Priority",
              "Budget",
              "Assigned",
              "Follow-up",
              "Actions",
            ].map((h) => (
              <th key={h} className="sticky top-0 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e8edf5] text-[#334155]">
          {loading
            ? [...Array.from({ length: 6 }).keys()].map((skeletonIdx) => (
                <tr key={skeletonIdx}>
                  <td colSpan={13} className="px-4 py-3">
                    <div className="h-5 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            : leads.map((lead) => {
                const fu = lead.follow_up_date ? String(lead.follow_up_date) : null;
                const overdue = !!(fu && fu < today && !["Converted", "Lost", "Not Interested"].includes(String(lead.status || "")));
                const hot = lead.priority === "Hot";
                return (
                  <tr
                    key={lead.id}
                    className={[
                      overdue ? "bg-rose-50/80" : "",
                      hot ? "outline outline-2 outline-orange-200/70" : "",
                      fu === today ? "shadow-[inset_3px_0_0_#2563eb]" : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">{displayLeadName(lead)}</td>
                    <td className="max-w-[180px] truncate px-4 py-3">{lead.company_name || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{lead.phone || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{lead.whatsapp || "—"}</td>
                    <td className="max-w-[200px] truncate px-4 py-3">{lead.email || "—"}</td>
                    <td className="whitespace-nowrap">{lead.source || "—"}</td>
                    <td className="max-w-[200px] truncate text-xs">{String(lead.service_interest || "—")}</td>
                    <td>
                      <LeadStatusBadge status={String(lead.status)} />
                    </td>
                    <td className="whitespace-nowrap font-medium capitalize">{lead.priority || "—"}</td>
                    <td>{lead.budget != null ? `₹${Number(lead.budget).toLocaleString()}` : "—"}</td>
                    <td className="max-w-[120px] truncate">{lead.assigned_to ? employeeNameMap[lead.assigned_to] : "—"}</td>
                    <td className="whitespace-nowrap text-xs">{fu || "—"}</td>
                    <td className="flex flex-wrap gap-3 px-4 py-3 text-xs whitespace-nowrap">
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
                      {isAdmin && normalizeStatus(String(lead.status)) !== "Converted" && (
                        <button type="button" className="font-semibold text-emerald-700 hover:underline" onClick={() => onConvert(lead)}>
                          Convert
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          {!loading && leads.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-6 py-10 text-center text-slate-500">
                No leads match these filters yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ConvertedTable({
  leads,
  employeeNameMap,
  isAdmin,
  onProfile,
}: {
  leads: CrmClientRow[];
  employeeNameMap: Record<string, string>;
  isAdmin: boolean;
  onProfile: (l: CrmClientRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-[#f1f6fc] text-[#64748b]">
          <tr>
            <th className="px-4 py-3 text-left">Code</th>
            <th className="px-4 py-3 text-left">Client</th>
            <th className="px-4 py-3 text-left">Company</th>
            <th className="px-4 py-3 text-left">Phone</th>
            <th className="px-4 py-3 text-left">Email</th>
            <th className="px-4 py-3 text-left">Services</th>
            <th className="px-4 py-3 text-left">Deal</th>
            <th className="px-4 py-3 text-left">Converted</th>
            <th className="px-4 py-3 text-left">Owner</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((convertedLead) => (
            <tr key={convertedLead.id} className="border-t border-[#eef2ff]">
              <td className="px-4 py-3 font-mono text-xs">{convertedLead.client_code || "—"}</td>
              <td className="px-4 py-3 font-semibold">{displayLeadName(convertedLead)}</td>
              <td>{convertedLead.company_name || "—"}</td>
              <td className="whitespace-nowrap">{convertedLead.phone || "—"}</td>
              <td className="truncate max-w-[180px]">{convertedLead.email || "—"}</td>
              <td className="max-w-[200px] truncate text-xs">{String(convertedLead.service_interest || "—")}</td>
              <td>{convertedLead.proposal_amount != null ? `₹${Number(convertedLead.proposal_amount).toLocaleString()}` : "—"}</td>
              <td>{convertedLead.converted_at ? new Date(String(convertedLead.converted_at)).toLocaleDateString() : "—"}</td>
              <td>{convertedLead.assigned_to ? employeeNameMap[convertedLead.assigned_to] : "—"}</td>
              <td className="space-x-2 px-4 py-3 text-right text-xs">
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
  );
}

function ProposalTrackerTable({
  leads,
  isAdmin,
  onEdit,
}: {
  leads: CrmClientRow[];
  isAdmin: boolean;
  onEdit: (l: CrmClientRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="bg-[#f1f6fc] text-[#64748b]">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Lead</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Company</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Sent date</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Proposal link</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-[#64748b]">
                No leads match the current filters. Adjust filters on the All Leads tab or add a lead.
              </td>
            </tr>
          ) : (
            leads.map((proposalLead) => (
              <tr key={proposalLead.id} className="border-t border-[#eef2ff]">
                <td className="px-4 py-3 font-semibold text-slate-900">{displayLeadName(proposalLead) || "—"}</td>
                <td className="max-w-[200px] truncate px-4 py-3">{proposalLead.company_name || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {proposalLead.proposal_amount != null ? `₹${Number(proposalLead.proposal_amount).toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <ProposalStatusBadge status={String(proposalLead.proposal_status)} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">{proposalLead.proposal_sent_date || "—"}</td>
                <td className="px-4 py-3">
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
                <td className="px-4 py-3 text-right">
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
      <div className="fixed left-4 right-4 top-[8%] z-[61] mx-auto max-h-[85vh] max-w-lg overflow-y-auto rounded-[20px] border border-[#d4deea] bg-white p-6 shadow-2xl sm:left-auto sm:right-10">
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
          <Button type="button" className="rounded-full bg-[#2563eb]" disabled={submitting} onClick={onSave}>
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
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Date &amp; time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Lead / client</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Activity type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Notes</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">Created by</th>
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
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{new Date(ar.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {clientMap[ar.client_id] ? displayLeadName(clientMap[ar.client_id]) || "—" : "Unknown lead"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-800">{ar.activity_type || "—"}</td>
                    <td className="max-w-md px-4 py-3 text-xs text-slate-600">{detail || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-700">{by}</td>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      <p className="border-b border-[#f1f5f9] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-[#64748b]">{title}</p>
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
      <div className="fixed left-4 right-4 top-[15%] z-[61] mx-auto max-w-md rounded-[20px] border border-[#d4deea] bg-white p-5 shadow-2xl sm:left-auto">
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
          <Button type="button" className="rounded-full bg-[#2563eb]" disabled={submitting} onClick={onSave}>
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
      <div className="fixed inset-y-6 right-4 z-[61] mx-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[#d4deea] bg-white shadow-2xl sm:right-10">
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
              <Dt label="City" value={lead.city} />
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
                  <span key={s} className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-xs font-medium text-blue-800">
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
              <ul className="max-h-40 space-y-2 overflow-y-auto text-xs">
                {activities.slice(0, 25).map((a) => (
                  <li key={a.id} className="rounded-lg border border-[#e8edf5] p-2">
                    <span className="font-semibold text-[#334155]">{a.activity_type || "Activity"}</span>
                    <span className="text-[#64748b]">
                      {" "}
                      · {new Date(a.created_at).toLocaleString()}
                      {a.created_by ? ` · ${employeeMap[a.created_by] || ""}` : ""}
                    </span>
                    <p className="mt-1 text-[#475569]">{a.notes || ""}</p>
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
