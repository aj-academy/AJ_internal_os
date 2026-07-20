"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableHeaderCell, TableHeaderFilter, type TableHeaderFilterOption } from "@/components/ui/TableHeaderFilter";
import { TableSearchBar } from "@/components/ui/TableSearchBar";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import { normalizeStatus } from "@/components/student-lead-master/studentMasterHelpers";
import { normalizeProjectStatus } from "@/components/project-master/projectHelpers";
import { REPORTS_TAB_LABELS, REPORTS_TAB_ORDER, type ReportsTabId } from "@/components/reports/reportsConfig";
import { formatInr, friendlyReportsError, gapForObject, minutesToHoursLabel, monthKey, todayISO } from "@/components/reports/reportsHelpers";
import { exportMultiSheetExcel } from "@/components/reports/reportsExport";
import { exportReportWithMeta } from "@/components/reports/reportsExportMeta";
import {
  buildReportExportRows,
  EXPORT_DATA_TABS,
  type ReportDataTab,
  type ReportExportContext,
} from "@/components/reports/reportsExportRows";
import {
  CallReportPanel,
  DailyEmployeePanel,
  FollowupReportPanel,
  ProductivityWeightsNote,
  ReportsSchemaNotices,
  TimelineReportPanel,
  type DailyEmployeeRow,
} from "@/components/reports/ReportsCrmPanels";
import { resolveReportDateRange, type ReportDatePreset } from "@/lib/reports/dateRange";
import { computeProductivityScore } from "@/lib/reports/productivity";
import type {
  ReportActivity,
  ReportCallSession,
  ReportClientLite,
  ReportFollowup,
  ReportsDataPayload,
  SchemaGap,
} from "@/lib/reports/types";
import type { FinanceTransactionRow } from "@/types/finance";
import type { ProjectRow } from "@/types/project";

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
};

type ClientLite = ReportClientLite;

type TaskLite = {
  id: string;
  assigned_to: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string | null;
};

type AttendanceLite = {
  id: string;
  employee_id: string | null;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string | null;
  total_working_minutes: number | null;
  check_in_address: string | null;
};

type TeamRow = { project_id: string; profile_id: string };

function StatCard({ title, value, loading, subtitle }: { title: string; value: string | number; loading: boolean; subtitle?: string }) {
  return (
    <article className="flex min-h-[112px] flex-col rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <p className="text-sm font-medium text-[#64748b]">{title}</p>
      {loading ? <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-[#e8edf5]" /> : <p className="mt-1 text-2xl font-semibold text-[#0f172a]">{value}</p>}
      {subtitle ? <p className="mt-1 text-xs text-[#94a3b8]">{subtitle}</p> : null}
    </article>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[#475569]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-[#c9a227]" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  );
}

export function ReportsWorkbench() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<ReportsTabId>("overview");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<ReportDatePreset>("this_month");
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(todayISO);
  const [globalEmployeeId, setGlobalEmployeeId] = useState("");
  const [globalDepartment, setGlobalDepartment] = useState("");
  const [globalLeadSource, setGlobalLeadSource] = useState("");
  const [globalCourse, setGlobalCourse] = useState("");

  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLite[]>([]);
  const [financeTx, setFinanceTx] = useState<FinanceTransactionRow[]>([]);
  const [projectPayments, setProjectPayments] = useState<{ amount: number; payment_status: string; project_id: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamRow[]>([]);
  const [callSessions, setCallSessions] = useState<ReportCallSession[]>([]);
  const [followups, setFollowups] = useState<ReportFollowup[]>([]);
  const [timeline, setTimeline] = useState<ReportActivity[]>([]);
  const [schemaGaps, setSchemaGaps] = useState<SchemaGap[]>([]);
  const [reportMeta, setReportMeta] = useState<ReportsDataPayload["meta"] | null>(null);

  const activeRange = useMemo(
    () => resolveReportDateRange(datePreset, customFrom, customTo),
    [customFrom, customTo, datePreset],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        preset: datePreset,
        from: activeRange.from,
        to: activeRange.to,
      });
      if (globalEmployeeId) params.set("employeeId", globalEmployeeId);
      if (globalDepartment) params.set("department", globalDepartment);
      if (globalLeadSource) params.set("leadSource", globalLeadSource);
      if (globalCourse) params.set("course", globalCourse);

      const res = await fetch(`/api/reports/data?${params.toString()}`, { credentials: "same-origin" });
      const json = (await res.json()) as ReportsDataPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || `Reports API failed (${res.status})`);

      setProfiles(json.profiles || []);
      setClients(json.clients || []);
      setProjects((json.projects || []) as ProjectRow[]);
      setTasks(json.tasks || []);
      setAttendance(json.attendance || []);
      setFinanceTx((json.financeTx || []) as FinanceTransactionRow[]);
      setProjectPayments(json.projectPayments || []);
      setTeamMembers(json.teamMembers || []);
      setCallSessions(json.callSessions || []);
      setFollowups(json.followups || []);
      setTimeline(json.timeline || []);
      setSchemaGaps(json.gaps || []);
      setReportMeta(json.meta || null);
    } catch (e) {
      setLoadError(friendlyReportsError(e));
    } finally {
      setLoading(false);
    }
  }, [activeRange.from, activeRange.to, datePreset, globalCourse, globalDepartment, globalEmployeeId, globalLeadSource]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) setUserId(user.id);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!userId) return;
    void loadAll();
  }, [loadAll, userId]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("reports-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_transactions" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "project_payments" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_call_sessions" }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_followups" }, () => void loadAll())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [loadAll, supabase, userId]);

  const employeeNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => {
      m[p.id] = p.full_name || p.email || p.id.slice(0, 8);
    });
    return m;
  }, [profiles]);

  const activeEmployees = useMemo(() => profiles.filter((p) => (p.status || "active").toLowerCase() === "active"), [profiles]);
  const inactiveEmployees = useMemo(() => profiles.filter((p) => (p.status || "").toLowerCase() === "inactive"), [profiles]);

  const taskStats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "Completed").length;
    const pending = tasks.filter((t) => t.status === "Pending").length;
    const inProg = tasks.filter((t) => t.status === "In Progress").length;
    const tday = todayISO();
    const delayed = tasks.filter((t) => t.due_date && t.due_date < tday && t.status !== "Completed").length;
    return { total, completed, pending, inProg, delayed };
  }, [tasks]);

  const projectStats = useMemo(() => {
    const active = projects.filter((p) => normalizeProjectStatus(String(p.status)) === "Active").length;
    const completed = projects.filter((p) => normalizeProjectStatus(String(p.status)) === "Completed").length;
    const delayed = projects.filter((p) => normalizeProjectStatus(String(p.status)) === "Delayed").length;
    const avgProgress =
      projects.length > 0 ? Math.round(projects.reduce((a, p) => a + Number(p.progress ?? 0), 0) / projects.length) : 0;
    return { active, completed, delayed, avgProgress };
  }, [projects]);

  const clientStats = useMemo(() => {
    let converted = 0;
    let lost = 0;
    let leads = 0;
    clients.forEach((c) => {
      const st = normalizeStatus(String(c.status));
      if (st === "Converted" || c.converted_at) converted += 1;
      else if (st === "Lost" || (c.lost_reason && String(c.lost_reason).trim())) lost += 1;
      else leads += 1;
    });
    const denom = Math.max(1, clients.length);
    const rate = Math.round((converted / denom) * 1000) / 10;
    return { total: clients.length, converted, lost, leads, rate };
  }, [clients]);

  const financeStats = useMemo(() => {
    const rev = financeTx.filter((t) => t.transaction_type === "Income").reduce((a, t) => a + Number(t.amount), 0);
    const exp = financeTx.filter((t) => t.transaction_type === "Expense").reduce((a, t) => a + Number(t.amount), 0);
    const thisM = new Date().toISOString().slice(0, 7);
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const prevM = monthKey(prev);
    const revThis = financeTx.filter((t) => t.transaction_type === "Income" && String(t.transaction_date).slice(0, 7) === thisM).reduce((a, t) => a + Number(t.amount), 0);
    const revPrev = financeTx.filter((t) => t.transaction_type === "Income" && String(t.transaction_date).slice(0, 7) === prevM).reduce((a, t) => a + Number(t.amount), 0);
    const expThis = financeTx.filter((t) => t.transaction_type === "Expense" && String(t.transaction_date).slice(0, 7) === thisM).reduce((a, t) => a + Number(t.amount), 0);
    const growth = revPrev > 0 ? Math.round(((revThis - revPrev) / revPrev) * 1000) / 10 : revThis > 0 ? 100 : 0;
    const pendingDues = projects.reduce((a, p) => a + Number(p.pending_amount ?? 0), 0);
    return { rev, exp, net: rev - exp, revThis, expThis, growth, pendingDues };
  }, [financeTx, projects]);

  const attendanceToday = useMemo(() => {
    const d = todayISO();
    const rows = attendance.filter((a) => String(a.attendance_date).slice(0, 10) === d);
    const present = rows.filter((a) => {
      const s = (a.status || "").toLowerCase();
      return s === "present" || s.includes("late") || Boolean(a.check_in_time);
    }).length;
    const absent = rows.filter((a) => (a.status || "").toLowerCase() === "absent").length;
    const late = rows.filter((a) => (a.status || "").toLowerCase().includes("late")).length;
    const checkedIn = rows.filter((a) => Boolean(a.check_in_time)).length;
    const checkedOut = rows.filter((a) => Boolean(a.check_out_time)).length;
    return { present, absent, late, checkedIn, checkedOut, rows };
  }, [attendance]);

  const callStats = useMemo(() => {
    const total = callSessions.length;
    const outcomeOf = (pred: (o: string) => boolean) =>
      callSessions.filter((c) => pred((c.call_outcome || "").toLowerCase())).length;
    const connected = outcomeOf((o) => o.includes("connect") || o.includes("answered") || o === "interested" || o.includes("admission"));
    const busy = outcomeOf((o) => o.includes("busy"));
    const wrong = outcomeOf((o) => o.includes("wrong"));
    const interested = outcomeOf((o) => o.includes("interest"));
    return { total, connected, busy, wrong, interested };
  }, [callSessions]);

  const followupStats = useMemo(() => {
    const pending = followups.filter((f) => {
      const b = (f.followup_bucket || "").toLowerCase();
      const s = (f.status || "").toLowerCase();
      return b === "pending" || b === "today" || b === "overdue" || s === "pending";
    }).length;
    const completed = followups.filter((f) => {
      const b = (f.followup_bucket || "").toLowerCase();
      const s = (f.status || "").toLowerCase();
      return b === "completed" || ["completed", "done", "closed"].includes(s);
    }).length;
    return { total: followups.length, pending, completed };
  }, [followups]);

  const admissionStats = useMemo(() => {
    let admissions = 0;
    let cancelled = 0;
    let pendingFees = 0;
    let revenue = 0;
    clients.forEach((c) => {
      const adm = (c.admission_status || "").toLowerCase();
      const st = normalizeStatus(String(c.status));
      const pay = (c.payment_status || "").toLowerCase();
      const isAdmitted =
        ["admitted", "enrolled", "joined"].includes(adm) || st === "Converted" || Boolean(c.converted_at);
      if (["cancelled", "canceled", "withdrawn"].includes(adm)) cancelled += 1;
      else if (isAdmitted) {
        admissions += 1;
        revenue += Number(c.final_fee ?? c.fee_quoted ?? 0);
      }
      if (["pending", "partial", "due"].includes(pay)) pendingFees += Number(c.final_fee ?? c.fee_quoted ?? 0);
    });
    return { admissions, cancelled, pendingFees, revenue };
  }, [clients]);

  const crmUpdateCount = useMemo(
    () => timeline.filter((t) => t.source === "lead").length,
    [timeline],
  );

  const attendanceRateOverall = useMemo(() => {
    if (!attendance.length) return 0;
    const present = attendance.filter((a) => (a.status || "").toLowerCase() === "present").length;
    return Math.round((present / attendance.length) * 1000) / 10;
  }, [attendance]);

  const perEmployeeTaskCounts = useMemo(() => {
    const m: Record<string, { total: number; done: number }> = {};
    tasks.forEach((t) => {
      if (!m[t.assigned_to]) m[t.assigned_to] = { total: 0, done: 0 };
      m[t.assigned_to].total += 1;
      if (t.status === "Completed") m[t.assigned_to].done += 1;
    });
    return m;
  }, [tasks]);

  const perEmployeeAttendanceRate = useMemo(() => {
    const by: Record<string, { p: number; t: number }> = {};
    attendance.forEach((a) => {
      if (!a.employee_id) return;
      if (!by[a.employee_id]) by[a.employee_id] = { p: 0, t: 0 };
      by[a.employee_id].t += 1;
      if ((a.status || "").toLowerCase() === "present") by[a.employee_id].p += 1;
    });
    const out: Record<string, number> = {};
    Object.entries(by).forEach(([id, v]) => {
      out[id] = v.t ? Math.round((v.p / v.t) * 1000) / 10 : 0;
    });
    return out;
  }, [attendance]);

  const perEmployeeProjects = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    teamMembers.forEach((r) => {
      if (!m[r.profile_id]) m[r.profile_id] = new Set();
      m[r.profile_id].add(r.project_id);
    });
    return m;
  }, [teamMembers]);

  const [fltDept, setFltDept] = useState("");
  const [fltRole, setFltRole] = useState("");
  const [fltEmpStatus, setFltEmpStatus] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const [fltAttFrom, setFltAttFrom] = useState(() => new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  const [fltAttTo, setFltAttTo] = useState(todayISO);
  const [fltAttEmp, setFltAttEmp] = useState("");
  const [attSearch, setAttSearch] = useState("");
  const [fltClientSource, setFltClientSource] = useState("");
  const [fltClientStatus, setFltClientStatus] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [fltProjMgr, setFltProjMgr] = useState("");
  const [fltProjStatus, setFltProjStatus] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [fltTaskEmp, setFltTaskEmp] = useState("");
  const [fltTaskStatus, setFltTaskStatus] = useState("");
  const [fltTaskProject, setFltTaskProject] = useState("");
  const [taskSearch, setTaskSearch] = useState("");

  const filteredProfiles = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return profiles.filter((p) => {
      if (q) {
        const hay = `${p.full_name ?? ""} ${p.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fltDept && (p.department || "") !== fltDept) return false;
      if (fltRole && (p.role || "") !== fltRole) return false;
      if (fltEmpStatus && (p.status || "active") !== fltEmpStatus) return false;
      return true;
    });
  }, [empSearch, profiles, fltDept, fltEmpStatus, fltRole]);

  const filteredAttendance = useMemo(() => {
    const q = attSearch.trim().toLowerCase();
    return attendance.filter((a) => {
      const d = String(a.attendance_date).slice(0, 10);
      if (fltAttFrom && d < fltAttFrom) return false;
      if (fltAttTo && d > fltAttTo) return false;
      if (fltAttEmp && a.employee_id !== fltAttEmp) return false;
      if (fltDept && a.employee_id) {
        const dep = profiles.find((p) => p.id === a.employee_id)?.department || "";
        if (dep !== fltDept) return false;
      }
      if (q && a.employee_id) {
        const name = employeeNameMap[a.employee_id] ?? "";
        if (!name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [attSearch, attendance, employeeNameMap, fltAttEmp, fltAttFrom, fltAttTo, fltDept, profiles]);

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    return clients.filter((c) => {
      if (q) {
        const hay = `${c.name ?? ""} ${c.company_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fltClientSource && (c.source || "") !== fltClientSource) return false;
      if (fltClientStatus && normalizeStatus(String(c.status)) !== normalizeStatus(fltClientStatus)) return false;
      return true;
    });
  }, [clientSearch, clients, fltClientSource, fltClientStatus]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    return projects.filter((p) => {
      if (q && !String(p.project_name || "").toLowerCase().includes(q)) return false;
      if (fltProjMgr && String(p.project_manager || "") !== fltProjMgr) return false;
      if (fltProjStatus && normalizeProjectStatus(String(p.status)) !== fltProjStatus) return false;
      return true;
    });
  }, [fltProjMgr, fltProjStatus, projectSearch, projects]);

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    return tasks.filter((t) => {
      if (q && !String(t.id || "").toLowerCase().includes(q)) return false;
      if (fltTaskEmp && t.assigned_to !== fltTaskEmp) return false;
      if (fltTaskStatus && t.status !== fltTaskStatus) return false;
      if (fltTaskProject && String(t.project_id || "") !== fltTaskProject) return false;
      return true;
    });
  }, [fltTaskEmp, fltTaskProject, fltTaskStatus, taskSearch, tasks]);

  const clientSourceOptions = useMemo(
    () =>
      Array.from(new Set(clients.map((c) => c.source).filter(Boolean) as string[]))
        .sort()
        .map((s) => ({ value: s, label: s })),
    [clients],
  );

  const clientStatusOptions = useMemo(
    () =>
      Array.from(new Set(clients.map((c) => normalizeStatus(String(c.status)))))
        .sort()
        .map((s) => ({ value: s, label: s })),
    [clients],
  );

  const distinctDepts = useMemo(() => {
    const s = new Set<string>();
    profiles.forEach((p) => {
      if (p.department) s.add(p.department);
    });
    return Array.from(s).sort();
  }, [profiles]);

  const sourceBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    clients.forEach((c) => {
      const k = c.source || "Unknown";
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [clients]);

  const projectStatusBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    projects.forEach((p) => {
      const k = normalizeProjectStatus(String(p.status));
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m);
  }, [projects]);

  const revenueByClientFromTx = useMemo(() => {
    const m: Record<string, number> = {};
    financeTx.forEach((t) => {
      if (t.transaction_type !== "Income" || !t.client_id) return;
      m[t.client_id] = (m[t.client_id] || 0) + Number(t.amount);
    });
    return Object.entries(m)
      .map(([id, amt]) => ({ id, amt, name: clients.find((c) => c.id === id)?.company_name || clients.find((c) => c.id === id)?.name || id }))
      .sort((a, b) => b.amt - a.amt);
  }, [clients, financeTx]);

  const revenueByProjectFromTx = useMemo(() => {
    const m: Record<string, number> = {};
    financeTx.forEach((t) => {
      if (t.transaction_type !== "Income" || !t.project_id) return;
      m[t.project_id] = (m[t.project_id] || 0) + Number(t.amount);
    });
    return Object.entries(m)
      .map(([id, amt]) => ({ id, amt, name: projects.find((p) => p.id === id)?.project_name || id }))
      .sort((a, b) => b.amt - a.amt);
  }, [financeTx, projects]);

  const expenseByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    financeTx.forEach((t) => {
      if (t.transaction_type !== "Expense") return;
      const k = t.category || "Other";
      m[k] = (m[k] || 0) + Number(t.amount);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [financeTx]);

  const paymentStatusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    projectPayments.forEach((p) => {
      const k = p.payment_status || "—";
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m);
  }, [projectPayments]);

  const topPerformers = useMemo(() => {
    return [...profiles]
      .map((p) => {
        const tc = perEmployeeTaskCounts[p.id] || { total: 0, done: 0 };
        const score = tc.total ? Math.round((tc.done / tc.total) * 100) : 0;
        return { p, score, tc };
      })
      .filter((x) => x.tc.total > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [perEmployeeTaskCounts, profiles]);

  const bestRevenueProject = useMemo(() => revenueByProjectFromTx[0], [revenueByProjectFromTx]);
  const bestRevenueClient = useMemo(() => revenueByClientFromTx[0], [revenueByClientFromTx]);

  const serviceInterestBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    clients.forEach((c) => {
      const k = c.service_interest || "—";
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [clients]);

  const proposalBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    clients.forEach((c) => {
      const k = c.proposal_status || "—";
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [clients]);

  const monthlyRevTrend = useMemo(() => {
    const m: Record<string, number> = {};
    financeTx.forEach((t) => {
      if (t.transaction_type !== "Income") return;
      const k = String(t.transaction_date).slice(0, 7);
      m[k] = (m[k] || 0) + Number(t.amount);
    });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  }, [financeTx]);

  const monthlyExpTrend = useMemo(() => {
    const m: Record<string, number> = {};
    financeTx.forEach((t) => {
      if (t.transaction_type !== "Expense") return;
      const k = String(t.transaction_date).slice(0, 7);
      m[k] = (m[k] || 0) + Number(t.amount);
    });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  }, [financeTx]);

  const taskTrendByDay = useMemo(() => {
    const m: Record<string, number> = {};
    tasks.forEach((t) => {
      if (t.status !== "Completed") return;
      const d = t.due_date ? String(t.due_date).slice(0, 10) : "";
      if (!d) return;
      m[d] = (m[d] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [tasks]);

  const productivityScore = useMemo(() => {
    const { score } = computeProductivityScore({
      callsDone: callStats.connected || callStats.total,
      crmUpdates: crmUpdateCount,
      followupsDone: followupStats.completed,
      taskCompletionRatio: taskStats.total ? taskStats.completed / taskStats.total : 0,
      admissions: admissionStats.admissions,
      attendanceRatio: attendanceRateOverall / 100,
    });
    return score;
  }, [admissionStats.admissions, attendanceRateOverall, callStats.connected, callStats.total, crmUpdateCount, followupStats.completed, taskStats.completed, taskStats.total]);

  const teamPerformance = useMemo(() => {
    const byEmp: Record<
      string,
      { calls: number; admissions: number; revenue: number; followupsPending: number; score: number; name: string }
    > = {};
    profiles.forEach((p) => {
      byEmp[p.id] = {
        calls: 0,
        admissions: 0,
        revenue: 0,
        followupsPending: 0,
        score: 0,
        name: p.full_name || p.email || p.id.slice(0, 8),
      };
    });
    callSessions.forEach((c) => {
      if (!byEmp[c.employee_id]) return;
      byEmp[c.employee_id].calls += 1;
    });
    clients.forEach((c) => {
      if (!c.assigned_to || !byEmp[c.assigned_to]) return;
      const adm = (c.admission_status || "").toLowerCase();
      const st = normalizeStatus(String(c.status));
      const isAdmitted =
        ["admitted", "enrolled", "joined"].includes(adm) || st === "Converted" || Boolean(c.converted_at);
      if (isAdmitted) {
        byEmp[c.assigned_to].admissions += 1;
        byEmp[c.assigned_to].revenue += Number(c.final_fee ?? c.fee_quoted ?? 0);
      }
    });
    followups.forEach((f) => {
      const id = f.assigned_employee_id;
      if (!id || !byEmp[id]) return;
      const b = (f.followup_bucket || "").toLowerCase();
      const s = (f.status || "").toLowerCase();
      if (b === "pending" || b === "overdue" || s === "pending") byEmp[id].followupsPending += 1;
    });
    Object.keys(byEmp).forEach((id) => {
      const tc = perEmployeeTaskCounts[id] || { total: 0, done: 0 };
      const empCalls = callSessions.filter((c) => c.employee_id === id);
      const empCrm = timeline.filter((t) => t.actor_id === id && t.source === "lead").length;
      const empFuDone = followups.filter((f) => {
        if (f.assigned_employee_id !== id) return false;
        const s = (f.status || "").toLowerCase();
        return ["completed", "done", "closed"].includes(s) || f.followup_bucket === "completed";
      }).length;
      const { score } = computeProductivityScore({
        callsDone: empCalls.length,
        crmUpdates: empCrm,
        followupsDone: empFuDone,
        taskCompletionRatio: tc.total ? tc.done / tc.total : 0,
        admissions: byEmp[id].admissions,
        attendanceRatio: (perEmployeeAttendanceRate[id] ?? 0) / 100,
      });
      byEmp[id].score = score;
    });
    const ranked = Object.entries(byEmp)
      .map(([id, v]) => ({ id, ...v }))
      .filter((x) => x.calls + x.admissions + x.followupsPending + (perEmployeeTaskCounts[x.id]?.total || 0) > 0)
      .sort((a, b) => b.score - a.score);
    return {
      rows: ranked,
      top: ranked[0] || null,
      least: ranked.length ? ranked[ranked.length - 1] : null,
      totals: {
        calls: callStats.total,
        admissions: admissionStats.admissions,
        revenue: admissionStats.revenue + financeStats.rev,
        pendingFollowups: followupStats.pending,
        avgProductivity: ranked.length ? Math.round(ranked.reduce((a, r) => a + r.score, 0) / ranked.length) : productivityScore,
      },
    };
  }, [
    admissionStats.admissions,
    admissionStats.revenue,
    callSessions,
    callStats.total,
    clients,
    financeStats.rev,
    followupStats.pending,
    followups,
    perEmployeeAttendanceRate,
    perEmployeeTaskCounts,
    productivityScore,
    profiles,
    timeline,
  ]);

  const dailyEmployeeRows = useMemo((): DailyEmployeeRow[] => {
    return profiles
      .filter((p) => (p.status || "active").toLowerCase() === "active")
      .map((p) => {
        const attRows = attendance.filter((a) => a.employee_id === p.id);
        const latest = attRows[0];
        const mins = attRows.reduce((a, r) => a + Number(r.total_working_minutes || 0), 0);
        const calls = callSessions.filter((c) => c.employee_id === p.id);
        const oc = (pred: (o: string) => boolean) =>
          calls.filter((c) => pred((c.call_outcome || "").toLowerCase())).length;
        const tc = perEmployeeTaskCounts[p.id] || { total: 0, done: 0 };
        const empClients = clients.filter((c) => c.assigned_to === p.id);
        let admissions = 0;
        let revenue = 0;
        empClients.forEach((c) => {
          const adm = (c.admission_status || "").toLowerCase();
          const st = normalizeStatus(String(c.status));
          if (["admitted", "enrolled", "joined"].includes(adm) || st === "Converted" || c.converted_at) {
            admissions += 1;
            revenue += Number(c.final_fee ?? c.fee_quoted ?? 0);
          }
        });
        const crmUpdates = timeline.filter((t) => t.actor_id === p.id && t.source === "lead").length;
        const fu = followups.filter((f) => f.assigned_employee_id === p.id).length;
        const remarks = calls
          .map((c) => c.notes)
          .filter(Boolean)
          .slice(0, 2)
          .join("; ");
        return {
          employeeId: p.id,
          name: p.full_name || p.email || p.id.slice(0, 8),
          department: p.department || "",
          attendance: latest?.status || (latest?.check_in_time ? "Checked in" : "—"),
          workingHours: minutesToHoursLabel(mins || latest?.total_working_minutes),
          calls: calls.length,
          connected: oc((o) => o.includes("connect") || o.includes("answered")),
          busy: oc((o) => o.includes("busy")),
          wrongNumber: oc((o) => o.includes("wrong")),
          interested: oc((o) => o.includes("interest")),
          admissions,
          revenue,
          tasksDone: tc.done,
          tasksTotal: tc.total,
          crmUpdates,
          followups: fu,
          remarks,
        };
      })
      .filter((r) => r.calls + r.tasksTotal + r.followups + r.admissions + r.crmUpdates > 0 || r.attendance !== "—");
  }, [attendance, callSessions, clients, followups, perEmployeeTaskCounts, profiles, timeline]);

  const leadSourceReport = useMemo(() => {
    const m: Record<string, { generated: number; interested: number; admissions: number; revenue: number }> = {};
    clients.forEach((c) => {
      const k = c.source || "Unknown";
      if (!m[k]) m[k] = { generated: 0, interested: 0, admissions: 0, revenue: 0 };
      m[k].generated += 1;
      const st = normalizeStatus(String(c.status)).toLowerCase();
      const stage = (c.lead_stage || "").toLowerCase();
      if (st.includes("interest") || stage.includes("interest") || (c.interested_program || c.service_interest)) {
        m[k].interested += 1;
      }
      const adm = (c.admission_status || "").toLowerCase();
      if (["admitted", "enrolled", "joined"].includes(adm) || normalizeStatus(String(c.status)) === "Converted" || c.converted_at) {
        m[k].admissions += 1;
        m[k].revenue += Number(c.final_fee ?? c.fee_quoted ?? 0);
      }
    });
    return Object.entries(m)
      .map(([source, v]) => ({
        source,
        ...v,
        conversion: v.generated ? Math.round((v.admissions / v.generated) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.generated - a.generated);
  }, [clients]);

  const courseAdmissionReport = useMemo(() => {
    const m: Record<string, { admissions: number; revenue: number; pendingFees: number; cancelled: number }> = {};
    clients.forEach((c) => {
      const course = c.interested_program || c.service_interest || "Unspecified";
      if (!m[course]) m[course] = { admissions: 0, revenue: 0, pendingFees: 0, cancelled: 0 };
      const adm = (c.admission_status || "").toLowerCase();
      const pay = (c.payment_status || "").toLowerCase();
      if (["cancelled", "canceled", "withdrawn"].includes(adm)) m[course].cancelled += 1;
      const isAdmitted =
        ["admitted", "enrolled", "joined"].includes(adm) ||
        normalizeStatus(String(c.status)) === "Converted" ||
        Boolean(c.converted_at);
      if (isAdmitted) {
        m[course].admissions += 1;
        m[course].revenue += Number(c.final_fee ?? c.fee_quoted ?? 0);
      }
      if (["pending", "partial", "due"].includes(pay)) {
        m[course].pendingFees += Number(c.final_fee ?? c.fee_quoted ?? 0);
      }
    });
    return Object.entries(m)
      .map(([course, v]) => ({ course, ...v }))
      .sort((a, b) => b.admissions - a.admissions || b.revenue - a.revenue);
  }, [clients]);

  const revenueByEmployee = useMemo(() => {
    const m: Record<string, { admissions: number; revenue: number; pendingFees: number }> = {};
    clients.forEach((c) => {
      const id = c.assigned_to || "unassigned";
      if (!m[id]) m[id] = { admissions: 0, revenue: 0, pendingFees: 0 };
      const adm = (c.admission_status || "").toLowerCase();
      const pay = (c.payment_status || "").toLowerCase();
      const isAdmitted =
        ["admitted", "enrolled", "joined"].includes(adm) ||
        normalizeStatus(String(c.status)) === "Converted" ||
        Boolean(c.converted_at);
      if (isAdmitted) {
        m[id].admissions += 1;
        m[id].revenue += Number(c.final_fee ?? c.fee_quoted ?? 0);
      }
      if (["pending", "partial", "due"].includes(pay)) {
        m[id].pendingFees += Number(c.final_fee ?? c.fee_quoted ?? 0);
      }
    });
    return Object.entries(m)
      .map(([id, v]) => ({
        id,
        name: id === "unassigned" ? "Unassigned" : employeeNameMap[id] || id.slice(0, 8),
        ...v,
        avgRevenue: v.admissions ? Math.round((v.revenue / v.admissions) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [clients, employeeNameMap]);

  const exportContext = useMemo<ReportExportContext>(
    () => ({
      profiles,
      clients,
      projects,
      tasks,
      attendance,
      financeTx,
      filteredProfiles,
      filteredClients,
      filteredProjects,
      filteredTasks,
      filteredAttendance,
      callSessions,
      followups,
      timeline,
      dailyEmployeeRows,
      employeeNameMap,
      perEmployeeTaskCounts,
      perEmployeeAttendanceRate,
      perEmployeeProjects,
      distinctDepts,
      activeEmployeesCount: activeEmployees.length,
      taskStats,
      financeStats,
      attendanceRateOverall,
      productivityScore,
      topPerformers,
      bestRevenueProject,
      bestRevenueClient,
      overviewExtras: {
        presentToday: attendanceToday.present,
        checkedIn: attendanceToday.checkedIn,
        checkedOut: attendanceToday.checkedOut,
        calls: callStats.total,
        connected: callStats.connected,
        pendingFollowups: followupStats.pending,
        admissions: admissionStats.admissions,
        revenue: admissionStats.revenue + financeStats.rev,
        pendingTasks: taskStats.pending + taskStats.inProg,
        avgProductivity: teamPerformance.totals.avgProductivity,
      },
    }),
    [
      activeEmployees.length,
      admissionStats.admissions,
      admissionStats.revenue,
      attendance,
      attendanceRateOverall,
      attendanceToday.checkedIn,
      attendanceToday.checkedOut,
      attendanceToday.present,
      bestRevenueClient,
      bestRevenueProject,
      callSessions,
      callStats.connected,
      callStats.total,
      clients,
      dailyEmployeeRows,
      distinctDepts,
      employeeNameMap,
      filteredAttendance,
      filteredClients,
      filteredProfiles,
      filteredProjects,
      filteredTasks,
      financeStats,
      financeTx,
      followupStats.pending,
      followups,
      perEmployeeAttendanceRate,
      perEmployeeProjects,
      perEmployeeTaskCounts,
      productivityScore,
      profiles,
      projects,
      taskStats,
      tasks,
      teamPerformance.totals.avgProductivity,
      timeline,
      topPerformers,
    ],
  );

  const filteredExportRows = useMemo(() => {
    if (activeTab === "export") return [];
    return buildReportExportRows(activeTab, "filtered", exportContext);
  }, [activeTab, exportContext]);

  const allExportRowsByTab = useMemo(() => {
    const map = {} as Record<ReportDataTab, ReturnType<typeof buildReportExportRows>>;
    for (const tab of EXPORT_DATA_TABS) {
      map[tab] = buildReportExportRows(tab, "all", exportContext);
    }
    return map;
  }, [exportContext]);

  const exportLabel = activeTab === "export" ? "Export Center" : REPORTS_TAB_LABELS[activeTab];

  const runExport = useCallback(
    async (format: "pdf" | "excel" | "csv", tab: ReportDataTab, scope: "filtered" | "all") => {
      const rows = buildReportExportRows(tab, scope, exportContext);
      if (!rows.length) {
        setExportMessage("No data available for this report.");
        return;
      }
      const busyKey = `${format}:${tab}:${scope}`;
      setExportBusy(busyKey);
      setExportMessage(null);
      const stamp = new Date().toISOString().slice(0, 10);
      const slug = tab.replace(/_/g, "-");
      const scopeSlug = scope === "all" ? "full" : "filtered";
      const base = `aj-academy-${slug}-${scopeSlug}-${stamp}`;
      try {
        await exportReportWithMeta(format, base, rows, {
          companyName: reportMeta?.companyName || "AJ Academy",
          reportName: REPORTS_TAB_LABELS[tab],
          generatedAt: reportMeta?.generatedAt || new Date().toISOString(),
          generatedBy: reportMeta?.generatedBy || null,
          dateFrom: activeRange.from,
          dateTo: activeRange.to,
          summary: `${rows.length} row(s) · scope ${scope}`,
        });
        setExportMessage(`Exported ${rows.length} row(s) — ${REPORTS_TAB_LABELS[tab]} (${scope === "all" ? "all data" : "filtered"}).`);
      } catch (e) {
        setExportMessage(friendlyReportsError(e));
      } finally {
        setExportBusy(null);
      }
    },
    [activeRange.from, activeRange.to, exportContext, reportMeta],
  );

  const runExportAllWorkbook = useCallback(async () => {
    setExportBusy("workbook:excel");
    setExportMessage(null);
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      const sheets = EXPORT_DATA_TABS.map((tab) => ({
        name: REPORTS_TAB_LABELS[tab].replace(/ reports?/i, "").slice(0, 31),
        rows: allExportRowsByTab[tab],
      })).filter((s) => s.rows.length > 0);
      if (!sheets.length) {
        setExportMessage("No report data available to export.");
        return;
      }
      await exportMultiSheetExcel(`aj-academy-all-reports-${stamp}.xlsx`, sheets);
      const total = sheets.reduce((n, s) => n + s.rows.length, 0);
      setExportMessage(`Downloaded workbook with ${sheets.length} sheet(s), ${total} total row(s).`);
    } catch (e) {
      setExportMessage(friendlyReportsError(e));
    } finally {
      setExportBusy(null);
    }
  }, [allExportRowsByTab]);

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Reports &amp; Analytics</h2>
          <p className="mt-1 text-xs text-[#64748b] sm:text-sm">
            Live Supabase data · SQL-filtered range {activeRange.from} → {activeRange.to}
            {reportMeta?.generatedBy ? ` · Viewer: ${reportMeta.generatedBy}` : ""}
          </p>
        </div>
        <Button variant="outline" className="h-9 rounded-full border-[#e8dcc8]" disabled={loading} onClick={() => void loadAll()}>
          Refresh data
        </Button>
      </header>

      {loadError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{loadError}</div> : null}
      <ReportsSchemaNotices gaps={schemaGaps.filter((g) => g.kind !== "missing_activity")} />

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-3">
        <label className="text-xs text-[#64748b]">
          Period
          <select
            className="mt-1 block h-9 rounded-lg border border-[#dbe6f3] bg-white px-2 text-sm"
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as ReportDatePreset)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This week</option>
            <option value="this_month">This month</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {datePreset === "custom" ? (
          <>
            <label className="text-xs text-[#64748b]">
              From
              <Input type="date" className="mt-1 h-9 w-[150px]" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="text-xs text-[#64748b]">
              To
              <Input type="date" className="mt-1 h-9 w-[150px]" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>
        ) : null}
        <label className="text-xs text-[#64748b]">
          Employee
          <select
            className="mt-1 block h-9 min-w-[160px] rounded-lg border border-[#dbe6f3] bg-white px-2 text-sm"
            value={globalEmployeeId}
            onChange={(e) => setGlobalEmployeeId(e.target.value)}
          >
            <option value="">All employees</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email || p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[#64748b]">
          Department
          <select
            className="mt-1 block h-9 min-w-[140px] rounded-lg border border-[#dbe6f3] bg-white px-2 text-sm"
            value={globalDepartment}
            onChange={(e) => setGlobalDepartment(e.target.value)}
          >
            <option value="">All departments</option>
            {distinctDepts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[#64748b]">
          Lead source
          <select
            className="mt-1 block h-9 min-w-[140px] rounded-lg border border-[#dbe6f3] bg-white px-2 text-sm"
            value={globalLeadSource}
            onChange={(e) => setGlobalLeadSource(e.target.value)}
          >
            <option value="">All sources</option>
            {clientSourceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[#64748b]">
          Course / program
          <Input
            className="mt-1 h-9 w-[160px]"
            placeholder="Exact match"
            value={globalCourse}
            onChange={(e) => setGlobalCourse(e.target.value)}
          />
        </label>
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
          Branch filter: unavailable (no org branch column on profiles/clients)
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {REPORTS_TAB_ORDER.map((tid) => (
            <button
              key={tid}
              type="button"
              onClick={() => setActiveTab(tid)}
              className={
                activeTab === tid
                  ? "rounded-xl bg-[#c9a227] px-3 py-2 text-sm font-semibold text-white shadow-md"
                  : "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-[#eaf1ff]"
              }
            >
              {REPORTS_TAB_LABELS[tid]}
            </button>
          ))}
        </div>
      </div>

      {activeTab !== "export" ? (
        <ReportExportBar
          tabLabel={exportLabel}
          rowCount={filteredExportRows.length}
          busy={exportBusy}
          message={exportMessage}
          disabled={loading}
          onExport={(format) => void runExport(format, activeTab as ReportDataTab, "filtered")}
        />
      ) : null}

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <div className="stat-cards-grid-5">
            <StatCard title="Total employees" value={profiles.length} loading={loading} />
            <StatCard title="Employees present" value={attendanceToday.present} loading={loading} subtitle="Today" />
            <StatCard title="Checked in" value={attendanceToday.checkedIn} loading={loading} subtitle="Today" />
            <StatCard title="Checked out" value={attendanceToday.checkedOut} loading={loading} subtitle="Today" />
            <StatCard
              title="Today's calls"
              value={gapForObject(schemaGaps, "lead_call") && !callSessions.length ? "Missing table" : callStats.total}
              loading={loading}
            />
            <StatCard title="Connected calls" value={callStats.connected} loading={loading} />
            <StatCard title="Pending follow-ups" value={followupStats.pending} loading={loading} />
            <StatCard title="Admissions" value={admissionStats.admissions} loading={loading} />
            <StatCard
              title="Revenue"
              value={formatInr(admissionStats.revenue + financeStats.rev)}
              loading={loading}
              subtitle="Fees + income tx in range"
            />
            <StatCard title="Tasks completed" value={taskStats.completed} loading={loading} />
            <StatCard title="Pending tasks" value={taskStats.pending + taskStats.inProg} loading={loading} />
            <StatCard title="Avg productivity" value={teamPerformance.totals.avgProductivity} loading={loading} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Monthly revenue growth</p>
              <p className="mt-1 text-xs text-[#64748b]">MoM income: {financeStats.growth}% (vs last month)</p>
              <div className="mt-3 space-y-2">
                {monthlyRevTrend.map(([k, v]) => (
                  <BarRow key={k} label={k} value={v} max={Math.max(1, ...monthlyRevTrend.map((x) => x[1]))} />
                ))}
                {!monthlyRevTrend.length ? <p className="text-xs text-[#64748b]">No finance transactions in range.</p> : null}
              </div>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Revenue vs expense (monthly)</p>
              <div className="mt-3 space-y-2">
                {monthlyRevTrend.slice(-6).map(([k, rev]) => {
                  const exp = monthlyExpTrend.find((x) => x[0] === k)?.[1] ?? 0;
                  const max = Math.max(1, rev, exp);
                  return (
                    <div key={k} className="text-xs">
                      <p className="font-medium text-[#475569]">{k}</p>
                      <div className="mt-1 grid grid-cols-2 gap-2">
                        <BarRow label="Revenue" value={rev} max={max} />
                        <BarRow label="Expense" value={exp} max={max} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Project status breakdown</p>
              <div className="mt-3 space-y-2">
                {projectStatusBreakdown.map(([k, v]) => (
                  <BarRow key={k} label={k} value={v} max={Math.max(1, ...projectStatusBreakdown.map((x) => x[1]))} />
                ))}
                {!projects.length ? <p className="text-xs text-[#64748b]">No projects.</p> : null}
              </div>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Task completion (by due date)</p>
              <div className="mt-3 space-y-2">
                {taskTrendByDay.map(([k, v]) => (
                  <BarRow key={k} label={k} value={v} max={Math.max(1, ...taskTrendByDay.map((x) => x[1]))} />
                ))}
                {!taskTrendByDay.length ? <p className="text-xs text-[#64748b]">No completed tasks with due dates.</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "calls" ? (
        <CallReportPanel
          loading={loading}
          calls={callSessions}
          callGap={gapForObject(schemaGaps, "lead_call") || gapForObject(schemaGaps, "v_report_call")}
          durationNote={reportMeta?.durationNote || "Duration from approximate_duration_seconds only."}
        />
      ) : null}

      {activeTab === "followups" ? (
        <FollowupReportPanel
          loading={loading}
          followups={followups}
          gap={gapForObject(schemaGaps, "lead_follow") || gapForObject(schemaGaps, "v_report_follow")}
        />
      ) : null}

      {activeTab === "timeline" ? (
        <TimelineReportPanel
          loading={loading}
          timeline={timeline}
          gap={gapForObject(schemaGaps, "employee_timeline") || gapForObject(schemaGaps, "lead_activit")}
        />
      ) : null}

      {activeTab === "daily" ? <DailyEmployeePanel loading={loading} rows={dailyEmployeeRows} /> : null}

      {activeTab === "employees" ? (
        <div className="space-y-4">
          <div className="stat-cards-grid">
            <StatCard title="Total employees" value={profiles.length} loading={loading} />
            <StatCard title="Active" value={activeEmployees.length} loading={loading} />
            <StatCard title="Inactive" value={inactiveEmployees.length} loading={loading} />
            <StatCard title="Departments" value={distinctDepts.length} loading={loading} />
          </div>
          <TableSearchBar
            value={empSearch}
            onChange={setEmpSearch}
            placeholder="Search employee name or email…"
            showClear={Boolean(empSearch.trim() || fltDept || fltRole || fltEmpStatus)}
            onClear={() => {
              setEmpSearch("");
              setFltDept("");
              setFltRole("");
              setFltEmpStatus("");
            }}
            hint={`Showing ${filteredProfiles.length} of ${profiles.length} employee(s)`}
          />
          <ScrollTable
            columns={[
              "Employee",
              {
                label: "Role",
                filter: {
                  value: fltRole,
                  onChange: setFltRole,
                  options: ["super_admin", "admin", "student", "freelancer", "mentor"].map((r) => ({ value: r, label: r })),
                  allLabel: "All roles",
                },
              },
              {
                label: "Department",
                filter: {
                  value: fltDept,
                  onChange: setFltDept,
                  options: distinctDepts.map((d) => ({ value: d, label: d })),
                  allLabel: "All departments",
                },
              },
              "Attendance %",
              "Tasks",
              "Done",
              "Projects",
              {
                label: "Status",
                filter: {
                  value: fltEmpStatus,
                  onChange: setFltEmpStatus,
                  options: [
                    { value: "active", label: "active" },
                    { value: "inactive", label: "inactive" },
                  ],
                  allLabel: "All statuses",
                },
              },
              "Rating",
            ]}
            rows={filteredProfiles}
            loading={loading}
            renderRow={(p) => {
              const tc = perEmployeeTaskCounts[p.id] || { total: 0, done: 0 };
              const ar = perEmployeeAttendanceRate[p.id] ?? 0;
              const pc = perEmployeeProjects[p.id]?.size ?? 0;
              const rating = tc.total ? Math.round((tc.done / tc.total) * 100) : "—";
              return (
                <tr key={p.id} className="border-t border-[#eef2ff]">
                  <td className="px-3 py-2 font-medium">{p.full_name || p.email}</td>
                  <td className="px-3 py-2">{p.role}</td>
                  <td className="px-3 py-2">{p.department || "—"}</td>
                  <td className="px-3 py-2">{ar}%</td>
                  <td className="px-3 py-2">{tc.total}</td>
                  <td className="px-3 py-2">{tc.done}</td>
                  <td className="px-3 py-2">{pc}</td>
                  <td className="px-3 py-2">{p.status || "active"}</td>
                  <td className="px-3 py-2">{rating}</td>
                </tr>
              );
            }}
            renderMobile={(p) => {
              const tc = perEmployeeTaskCounts[p.id] || { total: 0, done: 0 };
              const ar = perEmployeeAttendanceRate[p.id] ?? 0;
              const pc = perEmployeeProjects[p.id]?.size ?? 0;
              const rating = tc.total ? Math.round((tc.done / tc.total) * 100) : "—";
              return (
                <MobileRecordCard
                  key={p.id}
                  title={p.full_name || p.email || "Employee"}
                  subtitle={p.role || undefined}
                  previewFields={[
                    { label: "Department", value: p.department || "—" },
                    { label: "Attendance %", value: `${ar}%` },
                    { label: "Tasks", value: String(tc.total) },
                    { label: "Status", value: p.status || "active" },
                  ]}
                  detailFields={[
                    { label: "Employee", value: p.full_name || p.email },
                    { label: "Role", value: p.role },
                    { label: "Department", value: p.department || "—" },
                    { label: "Attendance %", value: `${ar}%` },
                    { label: "Tasks", value: String(tc.total) },
                    { label: "Done", value: String(tc.done) },
                    { label: "Projects", value: String(pc) },
                    { label: "Status", value: p.status || "active" },
                    { label: "Rating", value: String(rating) },
                  ]}
                />
              );
            }}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4">
              <p className="text-sm font-semibold text-[#0f172a]">Top performers (by task completion %)</p>
              <ul className="mt-2 space-y-1 text-sm text-[#475569]">
                {topPerformers.map(({ p, score }) => (
                  <li key={p.id} className="flex justify-between">
                    <span>{p.full_name || p.email}</span>
                    <span className="font-medium">{score}%</span>
                  </li>
                ))}
                {!topPerformers.length ? <li className="text-xs text-[#64748b]">No task assignments yet.</li> : null}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "attendance" ? (
        <div className="space-y-4">
          <div className="stat-cards-grid">
            <StatCard title="Present today" value={attendanceToday.present} loading={loading} />
            <StatCard title="Absent today" value={attendanceToday.absent} loading={loading} />
            <StatCard title="Late / flagged" value={attendanceToday.late} loading={loading} />
            <StatCard title="Avg attendance %" value={`${attendanceRateOverall}%`} loading={loading} subtitle="In loaded window" />
          </div>
          <TableSearchBar
            value={attSearch}
            onChange={setAttSearch}
            placeholder="Search employee name…"
            showClear={Boolean(attSearch.trim() || fltAttFrom || fltAttTo || fltAttEmp || fltDept)}
            onClear={() => {
              setAttSearch("");
              setFltAttFrom("");
              setFltAttTo("");
              setFltAttEmp("");
              setFltDept("");
            }}
            hint={`Showing ${filteredAttendance.length} of ${attendance.length} record(s)`}
          />
          <ScrollTable
            columns={[
              {
                label: "Employee",
                filter: {
                  value: fltAttEmp,
                  onChange: setFltAttEmp,
                  options: profiles.map((p) => ({ value: p.id, label: p.full_name || p.email || p.id })),
                  allLabel: "All employees",
                },
              },
              {
                label: "Date",
                filter: { value: fltAttFrom, onChange: setFltAttFrom, type: "date" },
              },
              "Check-in",
              "Check-out",
              "Hours",
              "Status",
              {
                label: "Department",
                filter: {
                  value: fltDept,
                  onChange: setFltDept,
                  options: distinctDepts.map((d) => ({ value: d, label: d })),
                  allLabel: "All departments",
                },
              },
              "Location",
            ]}
            rows={filteredAttendance}
            loading={loading}
            renderRow={(a) => (
              <tr key={a.id} className="border-t border-[#eef2ff]">
                <td className="px-3 py-2">{a.employee_id ? employeeNameMap[a.employee_id] || "—" : "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{String(a.attendance_date).slice(0, 10)}</td>
                <td className="px-3 py-2 text-xs">{a.check_in_time ? new Date(a.check_in_time).toLocaleString() : "—"}</td>
                <td className="px-3 py-2 text-xs">{a.check_out_time ? new Date(a.check_out_time).toLocaleString() : "—"}</td>
                <td className="px-3 py-2">{minutesToHoursLabel(a.total_working_minutes)}</td>
                <td className="px-3 py-2">{a.status || "—"}</td>
                <td className="px-3 py-2">
                  {a.employee_id ? profiles.find((p) => p.id === a.employee_id)?.department || "—" : "—"}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 text-xs">{a.check_in_address || "—"}</td>
              </tr>
            )}
            renderMobile={(a) => (
              <MobileRecordCard
                key={a.id}
                title={a.employee_id ? employeeNameMap[a.employee_id] || "Employee" : "Employee"}
                subtitle={String(a.attendance_date).slice(0, 10)}
                previewFields={[
                  { label: "Status", value: a.status || "—" },
                  { label: "Hours", value: minutesToHoursLabel(a.total_working_minutes) },
                  { label: "Check-in", value: a.check_in_time ? new Date(a.check_in_time).toLocaleString() : "—" },
                  { label: "Department", value: a.employee_id ? profiles.find((p) => p.id === a.employee_id)?.department || "—" : "—" },
                ]}
                detailFields={[
                  { label: "Employee", value: a.employee_id ? employeeNameMap[a.employee_id] || "—" : "—" },
                  { label: "Date", value: String(a.attendance_date).slice(0, 10) },
                  { label: "Check-in", value: a.check_in_time ? new Date(a.check_in_time).toLocaleString() : "—" },
                  { label: "Check-out", value: a.check_out_time ? new Date(a.check_out_time).toLocaleString() : "—" },
                  { label: "Hours", value: minutesToHoursLabel(a.total_working_minutes) },
                  { label: "Status", value: a.status || "—" },
                  { label: "Department", value: a.employee_id ? profiles.find((p) => p.id === a.employee_id)?.department || "—" : "—" },
                  { label: "Location", value: a.check_in_address || "—", clamp: true },
                ]}
              />
            )}
          />
        </div>
      ) : null}

      {activeTab === "clients" ? (
        <div className="space-y-4">
          <div className="stat-cards-grid">
            <StatCard title="Total records" value={clients.length} loading={loading} />
            <StatCard title="Converted" value={clientStats.converted} loading={loading} />
            <StatCard title="Lost" value={clientStats.lost} loading={loading} />
            <StatCard title="Conversion rate %" value={`${clientStats.rate}%`} loading={loading} subtitle="Converted / all" />
          </div>
          <TableSearchBar
            value={clientSearch}
            onChange={setClientSearch}
            placeholder="Search name or company…"
            showClear={Boolean(clientSearch.trim() || fltClientSource || fltClientStatus)}
            onClear={() => {
              setClientSearch("");
              setFltClientSource("");
              setFltClientStatus("");
            }}
            hint={`Showing ${filteredClients.length} of ${clients.length} client(s)`}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Lead source report</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {leadSourceReport.map((r) => (
                  <li key={r.source} className="flex justify-between gap-2">
                    <span>{r.source}</span>
                    <span className="text-xs text-[#64748b]">
                      Gen {r.generated} · Int {r.interested} · Adm {r.admissions} · {formatInr(r.revenue)} · {r.conversion}%
                    </span>
                  </li>
                ))}
                {!leadSourceReport.length ? <li className="text-xs text-[#64748b]">No leads.</li> : null}
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Service interest</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {serviceInterestBreakdown.map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Proposal status</p>
              <ul className="mt-2 space-y-1 text-sm">
                {proposalBreakdown.map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Admission by course</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {courseAdmissionReport.map((r) => (
                  <li key={r.course} className="flex justify-between gap-2">
                    <span>{r.course}</span>
                    <span className="text-xs text-[#64748b]">
                      Adm {r.admissions} · {formatInr(r.revenue)} · Pending {formatInr(r.pendingFees)} · Cancelled {r.cancelled}
                    </span>
                  </li>
                ))}
                {!courseAdmissionReport.length ? <li className="text-xs text-[#64748b]">No admission/course data.</li> : null}
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Client revenue (budget field)</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {[...clients]
                  .filter((c) => Number(c.budget ?? 0) > 0)
                  .sort((a, b) => Number(b.budget) - Number(a.budget))
                  .slice(0, 20)
                  .map((c) => (
                    <li key={c.id} className="flex justify-between">
                      <span>{c.company_name || c.name}</span>
                      <span>{formatInr(Number(c.budget))}</span>
                    </li>
                  ))}
                {!clients.some((c) => Number(c.budget) > 0) ? <li className="text-xs text-[#64748b]">No client budgets recorded.</li> : null}
              </ul>
            </div>
          </div>
          <ScrollTable
            columns={[
              "Name",
              "Company",
              {
                label: "Status",
                filter: {
                  value: fltClientStatus,
                  onChange: setFltClientStatus,
                  options: clientStatusOptions,
                  allLabel: "All statuses",
                },
              },
              {
                label: "Source",
                filter: {
                  value: fltClientSource,
                  onChange: setFltClientSource,
                  options: clientSourceOptions,
                  allLabel: "All sources",
                },
              },
              "Service",
              "Proposal",
              "Budget",
            ]}
            rows={filteredClients}
            loading={loading}
            renderRow={(c) => (
              <tr key={c.id} className="border-t border-[#eef2ff]">
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">{c.company_name || "—"}</td>
                <td className="px-3 py-2">{normalizeStatus(String(c.status))}</td>
                <td className="px-3 py-2">{c.source || "—"}</td>
                <td className="px-3 py-2">{c.service_interest || "—"}</td>
                <td className="px-3 py-2">{c.proposal_status || "—"}</td>
                <td className="px-3 py-2">{c.budget != null ? formatInr(Number(c.budget)) : "—"}</td>
              </tr>
            )}
            renderMobile={(c) => (
              <MobileRecordCard
                key={c.id}
                title={c.name || "Client"}
                subtitle={c.company_name || undefined}
                previewFields={[
                  { label: "Status", value: normalizeStatus(String(c.status)) },
                  { label: "Source", value: c.source || "—" },
                  { label: "Service", value: c.service_interest || "—" },
                  { label: "Budget", value: c.budget != null ? formatInr(Number(c.budget)) : "—" },
                ]}
                detailFields={[
                  { label: "Name", value: c.name },
                  { label: "Company", value: c.company_name || "—" },
                  { label: "Status", value: normalizeStatus(String(c.status)) },
                  { label: "Source", value: c.source || "—" },
                  { label: "Service", value: c.service_interest || "—" },
                  { label: "Proposal", value: c.proposal_status || "—" },
                  { label: "Budget", value: c.budget != null ? formatInr(Number(c.budget)) : "—" },
                ]}
              />
            )}
          />
        </div>
      ) : null}

      {activeTab === "projects" ? (
        <div className="space-y-4">
          <div className="stat-cards-grid">
            <StatCard title="Active" value={projectStats.active} loading={loading} />
            <StatCard title="Completed" value={projectStats.completed} loading={loading} />
            <StatCard title="Delayed" value={projectStats.delayed} loading={loading} />
            <StatCard title="Avg completion %" value={`${projectStats.avgProgress}%`} loading={loading} />
          </div>
          <TableSearchBar
            value={projectSearch}
            onChange={setProjectSearch}
            placeholder="Search project name…"
            showClear={Boolean(projectSearch.trim() || fltProjMgr || fltProjStatus)}
            onClear={() => {
              setProjectSearch("");
              setFltProjMgr("");
              setFltProjStatus("");
            }}
            hint={`Showing ${filteredProjects.length} of ${projects.length} project(s)`}
          />
          <ScrollTable
            columns={[
              "Project",
              "Client",
              {
                label: "Manager",
                filter: {
                  value: fltProjMgr,
                  onChange: setFltProjMgr,
                  options: profiles.map((p) => ({ value: p.id, label: p.full_name || p.email || p.id })),
                  allLabel: "All managers",
                },
              },
              "Budget",
              "Pending",
              "Progress",
              {
                label: "Status",
                filter: {
                  value: fltProjStatus,
                  onChange: setFltProjStatus,
                  options: ["Planning", "Active", "On Hold", "In Review", "Completed", "Cancelled", "Delayed"].map((s) => ({
                    value: s,
                    label: s,
                  })),
                  allLabel: "All statuses",
                },
              },
              "Deadline",
            ]}
            rows={filteredProjects}
            loading={loading}
            renderRow={(p) => (
              <tr key={p.id} className="border-t border-[#eef2ff]">
                <td className="px-3 py-2 font-medium">{p.project_name}</td>
                <td className="px-3 py-2">{p.client_id ? clients.find((c) => c.id === p.client_id)?.company_name || clients.find((c) => c.id === p.client_id)?.name || "—" : "—"}</td>
                <td className="px-3 py-2">{p.project_manager ? employeeNameMap[p.project_manager] || "—" : "—"}</td>
                <td className="px-3 py-2">{p.budget != null ? formatInr(Number(p.budget)) : "—"}</td>
                <td className="px-3 py-2">{formatInr(Number(p.pending_amount ?? 0))}</td>
                <td className="px-3 py-2">{p.progress ?? 0}%</td>
                <td className="px-3 py-2">{normalizeProjectStatus(String(p.status))}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.deadline ? String(p.deadline).slice(0, 10) : "—"}</td>
              </tr>
            )}
            renderMobile={(p) => {
              const clientLabel = p.client_id
                ? clients.find((c) => c.id === p.client_id)?.company_name || clients.find((c) => c.id === p.client_id)?.name || "—"
                : "—";
              return (
                <MobileRecordCard
                  key={p.id}
                  title={p.project_name || "Project"}
                  subtitle={clientLabel !== "—" ? clientLabel : undefined}
                  previewFields={[
                    { label: "Status", value: normalizeProjectStatus(String(p.status)) },
                    { label: "Progress", value: `${p.progress ?? 0}%` },
                    { label: "Manager", value: p.project_manager ? employeeNameMap[p.project_manager] || "—" : "—" },
                    { label: "Deadline", value: p.deadline ? String(p.deadline).slice(0, 10) : "—" },
                  ]}
                  detailFields={[
                    { label: "Project", value: p.project_name },
                    { label: "Client", value: clientLabel },
                    { label: "Manager", value: p.project_manager ? employeeNameMap[p.project_manager] || "—" : "—" },
                    { label: "Budget", value: p.budget != null ? formatInr(Number(p.budget)) : "—" },
                    { label: "Pending", value: formatInr(Number(p.pending_amount ?? 0)) },
                    { label: "Progress", value: `${p.progress ?? 0}%` },
                    { label: "Status", value: normalizeProjectStatus(String(p.status)) },
                    { label: "Deadline", value: p.deadline ? String(p.deadline).slice(0, 10) : "—" },
                  ]}
                />
              );
            }}
          />
        </div>
      ) : null}

      {activeTab === "tasks" ? (
        <div className="space-y-4">
          <div className="stat-cards-grid">
            <StatCard title="Total tasks" value={taskStats.total} loading={loading} />
            <StatCard title="Completed" value={taskStats.completed} loading={loading} />
            <StatCard title="Pending" value={taskStats.pending} loading={loading} />
            <StatCard title="Delayed" value={taskStats.delayed} loading={loading} />
          </div>
          <TableSearchBar
            value={taskSearch}
            onChange={setTaskSearch}
            placeholder="Search task ID…"
            showClear={Boolean(taskSearch.trim() || fltTaskEmp || fltTaskStatus || fltTaskProject)}
            onClear={() => {
              setTaskSearch("");
              setFltTaskEmp("");
              setFltTaskStatus("");
              setFltTaskProject("");
            }}
            hint={`Showing ${filteredTasks.length} of ${tasks.length} task(s)`}
          />
          <ScrollTable
            columns={[
              "Task ID",
              {
                label: "Assignee",
                filter: {
                  value: fltTaskEmp,
                  onChange: setFltTaskEmp,
                  options: profiles.map((p) => ({ value: p.id, label: p.full_name || p.email || p.id })),
                  allLabel: "All employees",
                },
              },
              {
                label: "Project",
                filter: {
                  value: fltTaskProject,
                  onChange: setFltTaskProject,
                  options: projects.map((p) => ({ value: p.id, label: p.project_name })),
                  allLabel: "All projects",
                },
              },
              "Priority",
              {
                label: "Status",
                filter: {
                  value: fltTaskStatus,
                  onChange: setFltTaskStatus,
                  options: ["Pending", "In Progress", "Completed"].map((s) => ({ value: s, label: s })),
                  allLabel: "All statuses",
                },
              },
              "Due",
            ]}
            rows={filteredTasks}
            loading={loading}
            renderRow={(t) => (
              <tr key={t.id} className="border-t border-[#eef2ff]">
                <td className="px-3 py-2 font-mono text-xs">{t.id.slice(0, 8)}</td>
                <td className="px-3 py-2">{employeeNameMap[t.assigned_to]}</td>
                <td className="px-3 py-2">{t.project_id ? projects.find((p) => p.id === t.project_id)?.project_name || "—" : "—"}</td>
                <td className="px-3 py-2">{t.priority}</td>
                <td className="px-3 py-2">{t.status}</td>
                <td className="px-3 py-2 whitespace-nowrap">{t.due_date || "—"}</td>
              </tr>
            )}
            renderMobile={(t) => (
              <MobileRecordCard
                key={t.id}
                title={`Task ${t.id.slice(0, 8)}`}
                subtitle={employeeNameMap[t.assigned_to] || undefined}
                previewFields={[
                  { label: "Status", value: t.status || "—" },
                  { label: "Priority", value: t.priority || "—" },
                  { label: "Project", value: t.project_id ? projects.find((p) => p.id === t.project_id)?.project_name || "—" : "—" },
                  { label: "Due date", value: t.due_date || "—" },
                ]}
                detailFields={[
                  { label: "Task ID", value: t.id },
                  { label: "Assignee", value: employeeNameMap[t.assigned_to] || "—" },
                  { label: "Project", value: t.project_id ? projects.find((p) => p.id === t.project_id)?.project_name || "—" : "—" },
                  { label: "Priority", value: t.priority || "—" },
                  { label: "Status", value: t.status || "—" },
                  { label: "Due date", value: t.due_date || "—" },
                ]}
              />
            )}
          />
        </div>
      ) : null}

      {activeTab === "finance" ? (
        <div className="space-y-4">
          <div className="stat-cards-grid-6">
            <StatCard title="Total revenue" value={formatInr(financeStats.rev + admissionStats.revenue)} loading={loading} subtitle="Tx + admission fees" />
            <StatCard title="Total expenses" value={formatInr(financeStats.exp)} loading={loading} />
            <StatCard title="Net profit" value={formatInr(financeStats.net)} loading={loading} />
            <StatCard title="Pending dues" value={formatInr(financeStats.pendingDues + admissionStats.pendingFees)} loading={loading} />
            <StatCard title="Monthly revenue" value={formatInr(financeStats.revThis)} loading={loading} />
            <StatCard title="Monthly expense" value={formatInr(financeStats.expThis)} loading={loading} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Revenue by employee (admissions)</p>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
                {revenueByEmployee.slice(0, 20).map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span>{r.name}</span>
                    <span className="text-xs text-[#64748b]">
                      Adm {r.admissions} · {formatInr(r.revenue)} · Pend {formatInr(r.pendingFees)} · Avg {formatInr(r.avgRevenue)}
                    </span>
                  </li>
                ))}
                {!revenueByEmployee.length ? <li className="text-xs text-[#64748b]">No admission fee rows.</li> : null}
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Revenue by client (transactions)</p>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
                {revenueByClientFromTx.slice(0, 20).map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.name}</span>
                    <span>{formatInr(r.amt)}</span>
                  </li>
                ))}
                {!revenueByClientFromTx.length ? <li className="text-xs text-[#64748b]">No income rows with client_id.</li> : null}
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Revenue by project</p>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
                {revenueByProjectFromTx.slice(0, 20).map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.name}</span>
                    <span>{formatInr(r.amt)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Expense by category</p>
              <ul className="mt-2 space-y-1 text-sm">
                {expenseByCategory.slice(0, 15).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span>{formatInr(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Payment status (project_payments)</p>
              <ul className="mt-2 space-y-1 text-sm">
                {paymentStatusCounts.map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "performance" ? (
        <div className="space-y-4">
          <div className="stat-cards-grid">
            <StatCard title="Productivity score" value={productivityScore} loading={loading} subtitle="Weighted formula" />
            <StatCard title="Avg team productivity" value={teamPerformance.totals.avgProductivity} loading={loading} />
            <StatCard title="Total calls" value={teamPerformance.totals.calls} loading={loading} />
            <StatCard title="Admissions" value={teamPerformance.totals.admissions} loading={loading} />
            <StatCard title="Revenue" value={formatInr(teamPerformance.totals.revenue)} loading={loading} />
            <StatCard title="Pending follow-ups" value={teamPerformance.totals.pendingFollowups} loading={loading} />
            <StatCard
              title="Top performer"
              value={teamPerformance.top?.name || "—"}
              loading={loading}
              subtitle={teamPerformance.top ? `Score ${teamPerformance.top.score}` : undefined}
            />
            <StatCard
              title="Least active"
              value={teamPerformance.least?.name || "—"}
              loading={loading}
              subtitle={teamPerformance.least ? `Score ${teamPerformance.least.score}` : undefined}
            />
          </div>
          <ProductivityWeightsNote />
          <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Calls</th>
                  <th className="px-3 py-2">Admissions</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">Pending FUs</th>
                  <th className="px-3 py-2">Productivity</th>
                </tr>
              </thead>
              <tbody>
                {teamPerformance.rows.slice(0, 50).map((r) => (
                  <tr key={r.id} className="border-t border-[#eef2f7]">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.calls}</td>
                    <td className="px-3 py-2">{r.admissions}</td>
                    <td className="px-3 py-2">{formatInr(r.revenue)}</td>
                    <td className="px-3 py-2">{r.followupsPending}</td>
                    <td className="px-3 py-2 font-semibold">{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 text-sm">
              <p className="font-semibold text-[#0f172a]">Best revenue project</p>
              <p className="mt-2 text-[#475569]">{bestRevenueProject ? `${bestRevenueProject.name} — ${formatInr(bestRevenueProject.amt)}` : "—"}</p>
              <p className="mt-4 font-semibold text-[#0f172a]">Most valuable client (tx revenue)</p>
              <p className="mt-2 text-[#475569]">{bestRevenueClient ? `${bestRevenueClient.name} — ${formatInr(bestRevenueClient.amt)}` : "—"}</p>
            </div>
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 text-sm text-[#475569]">
              <p className="font-semibold text-[#0f172a]">Department efficiency</p>
              <p className="mt-2 text-xs text-[#64748b]">Average task completion % by department (employees with tasks).</p>
              <ul className="mt-2 space-y-1">
                {distinctDepts.map((d) => {
                  const emps = profiles.filter((p) => p.department === d);
                  let tot = 0;
                  let done = 0;
                  emps.forEach((p) => {
                    const x = perEmployeeTaskCounts[p.id];
                    if (x) {
                      tot += x.total;
                      done += x.done;
                    }
                  });
                  const pct = tot ? Math.round((done / tot) * 100) : 0;
                  return (
                    <li key={d} className="flex justify-between">
                      <span>{d}</span>
                      <span>{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "export" ? (
        <ExportCenterPanel
          rowsByTab={allExportRowsByTab}
          busy={exportBusy}
          message={exportMessage}
          disabled={loading}
          onExport={(format, tab) => void runExport(format, tab, "all")}
          onExportWorkbook={() => void runExportAllWorkbook()}
        />
      ) : null}
    </section>
  );
}

function ExportCenterPanel({
  rowsByTab,
  busy,
  message,
  disabled,
  onExport,
  onExportWorkbook,
}: {
  rowsByTab: Record<ReportDataTab, ReturnType<typeof buildReportExportRows>>;
  busy: string | null;
  message: string | null;
  disabled: boolean;
  onExport: (format: "pdf" | "excel" | "csv", tab: ReportDataTab) => void;
  onExportWorkbook: () => void;
}) {
  const pillClass = "h-8 min-w-[3.5rem] rounded-full border-[#c9d4e6] px-3 text-xs font-semibold";
  const isBusy = (format: string, tab: ReportDataTab) => busy === `${format}:${tab}:all`;
  const workbookBusy = busy === "workbook:excel";

  return (
    <div className="space-y-4 rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#0f172a]">Export Center</h3>
          <p className="mt-1 text-sm text-[#64748b]">
            Download <strong>complete datasets</strong> — all rows, ignoring search and column filters on other tabs.
          </p>
        </div>
        <Button
          type="button"
          className="h-9 rounded-full bg-[#c9a227] px-4 text-sm font-semibold text-white hover:bg-[#b8921f]"
          disabled={disabled || busy !== null}
          onClick={onExportWorkbook}
        >
          {workbookBusy ? "Preparing…" : "Download all (Excel workbook)"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#dbe6f3] bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
            <tr>
              <th className="px-4 py-3 text-left">Report</th>
              <th className="px-4 py-3 text-left">Rows</th>
              <th className="px-4 py-3 text-right">PDF</th>
              <th className="px-4 py-3 text-right">Excel</th>
              <th className="px-4 py-3 text-right">CSV</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2ff]">
            {EXPORT_DATA_TABS.map((tab) => {
              const count = rowsByTab[tab].length;
              return (
                <tr key={tab}>
                  <td className="px-4 py-3 font-medium text-[#0f172a]">{REPORTS_TAB_LABELS[tab]}</td>
                  <td className="px-4 py-3 text-[#64748b]">{count}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      className={pillClass}
                      disabled={disabled || busy !== null || !count}
                      onClick={() => onExport("pdf", tab)}
                    >
                      {isBusy("pdf", tab) ? "…" : "PDF"}
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      className={pillClass}
                      disabled={disabled || busy !== null || !count}
                      onClick={() => onExport("excel", tab)}
                    >
                      {isBusy("excel", tab) ? "…" : "Excel"}
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      className={`${pillClass} border-[#c9a227] bg-[#c9a227] text-white hover:bg-[#b8921f]`}
                      disabled={disabled || busy !== null || !count}
                      onClick={() => onExport("csv", tab)}
                    >
                      {isBusy("csv", tab) ? "…" : "CSV"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
    </div>
  );
}

function ReportExportBar({
  tabLabel,
  rowCount,
  busy,
  message,
  disabled,
  onExport,
}: {
  tabLabel: string;
  rowCount: number;
  busy: string | null;
  message: string | null;
  disabled: boolean;
  onExport: (format: "pdf" | "excel" | "csv") => void;
}) {
  const pillClass = "h-9 min-w-[4.5rem] rounded-full border-[#c9d4e6] px-4 text-sm font-semibold";
  const busyFormat = busy?.startsWith("pdf:") ? "pdf" : busy?.startsWith("excel:") ? "excel" : busy?.startsWith("csv:") ? "csv" : null;

  return (
    <div className="space-y-2 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-[#64748b]">
            Export <span className="font-semibold text-[#0f172a]">{tabLabel}</span> with filters applied. PDF downloads as a{" "}
            <span className="font-semibold text-[#0f172a]">.pdf</span> file.
          </p>
          <p className="mt-0.5 text-xs text-[#94a3b8]">{rowCount} filtered row(s) · use Export Center for full datasets</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className={pillClass} disabled={disabled || busy !== null || !rowCount} onClick={() => onExport("pdf")}>
            {busyFormat === "pdf" ? "PDF…" : "PDF"}
          </Button>
          <Button type="button" variant="outline" className={pillClass} disabled={disabled || busy !== null || !rowCount} onClick={() => onExport("excel")}>
            {busyFormat === "excel" ? "Excel…" : "Excel"}
          </Button>
          <Button
            type="button"
            className={`${pillClass} border-[#c9a227] bg-[#c9a227] text-white hover:bg-[#b8921f]`}
            disabled={disabled || busy !== null || !rowCount}
            onClick={() => onExport("csv")}
          >
            {busyFormat === "csv" ? "CSV…" : "CSV"}
          </Button>
          <Button type="button" variant="outline" className={pillClass} disabled={disabled} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
    </div>
  );
}

type ScrollTableColumn =
  | string
  | {
      label: string;
      filter?: {
        value: string;
        onChange: (value: string) => void;
        options?: TableHeaderFilterOption[];
        allLabel?: string;
        disabled?: boolean;
        type?: "select" | "date";
      };
    };

function ScrollTable<T>({
  columns,
  rows,
  loading,
  renderRow,
  renderMobile,
}: {
  columns: ScrollTableColumn[];
  rows: T[];
  loading: boolean;
  renderRow: (row: T) => ReactNode;
  renderMobile?: (row: T) => ReactNode;
}) {
  const desktop = (
    <div className="max-h-[420px] overflow-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <div className="responsive-table-wrap">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
            <tr>
              {columns.map((col) => {
                if (typeof col === "string") {
                  return <TableHeaderCell key={col} label={col} />;
                }
                if (col.filter) {
                  return (
                    <TableHeaderFilter
                      key={col.label}
                      label={col.label}
                      value={col.filter.value}
                      onChange={col.filter.onChange}
                      options={col.filter.options}
                      allLabel={col.filter.allLabel}
                      disabled={col.filter.disabled}
                      type={col.filter.type}
                    />
                  );
                }
                return <TableHeaderCell key={col.label} label={col.label} />;
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={columns.length} className="px-3 py-2">
                      <div className="h-4 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              : rows.map(renderRow)}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-8 text-center text-[#64748b]">
                  No data for current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (!renderMobile) return desktop;

  return (
    <ResponsiveDataView
      desktop={desktop}
      mobile={
        loading ? (
          <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">Loading…</p>
        ) : !rows.length ? (
          <p className="rounded-2xl border border-[#e8dcc8] bg-white px-4 py-8 text-center text-sm text-[#64748b]">
            No data for current filters.
          </p>
        ) : (
          rows.map(renderMobile)
        )
      }
    />
  );
}
