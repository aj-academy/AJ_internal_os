"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeStatus } from "@/components/client-lead/crmHelpers";
import { TX_SELECT } from "@/components/finance/financeHelpers";
import { PROJECT_SELECT, normalizeProjectStatus } from "@/components/project-master/projectHelpers";
import { REPORTS_TAB_LABELS, REPORTS_TAB_ORDER, type ReportsTabId } from "@/components/reports/reportsConfig";
import { formatInr, friendlyReportsError, isMissingTable, minutesToHoursLabel, monthKey, todayISO } from "@/components/reports/reportsHelpers";
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

type ClientLite = {
  id: string;
  name: string;
  company_name: string | null;
  status: string | null;
  source: string | null;
  service_interest: string | null;
  proposal_status: string | null;
  budget: number | null;
  converted_at: string | null;
  lost_reason: string | null;
  created_at: string;
};

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
        <div className="h-2 rounded-full bg-[#2563eb]" style={{ width: `${Math.max(4, pct)}%` }} />
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

  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLite[]>([]);
  const [financeTx, setFinanceTx] = useState<FinanceTransactionRow[]>([]);
  const [projectPayments, setProjectPayments] = useState<{ amount: number; payment_status: string; project_id: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamRow[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const safe = async <T,>(label: string, fn: () => Promise<{ data: T | null; error: { message: string } | null }>, fallback: T): Promise<T> => {
      try {
        const { data, error } = await fn();
        if (error) {
          if (isMissingTable(error.message, label)) return fallback;
          throw new Error(error.message);
        }
        return (data as T) ?? fallback;
      } catch (e) {
        const msg = friendlyReportsError(e);
        if (isMissingTable(msg, label)) return fallback;
        throw e;
      }
    };

    try {
      const [pr, cl, pj, tk, att, fin, pay, tm] = await Promise.all([
        safe(
          "profiles",
          async () =>
            await supabase
              .from("profiles")
              .select("id,full_name,email,role,department,status")
              .order("full_name")
              .limit(800)
              .returns<ProfileLite[]>(),
          [],
        ),
        safe(
          "clients",
          async () =>
            await supabase
              .from("clients")
              .select("id,name,company_name,status,source,service_interest,proposal_status,budget,converted_at,lost_reason,created_at")
              .order("updated_at", { ascending: false })
              .limit(1200)
              .returns<ClientLite[]>(),
          [],
        ),
        safe(
          "projects",
          async () =>
            await supabase.from("projects").select(PROJECT_SELECT).order("updated_at", { ascending: false }).limit(600).returns<ProjectRow[]>(),
          [],
        ),
        safe(
          "tasks",
          async () =>
            await supabase.from("tasks").select("id,assigned_to,status,priority,due_date,project_id").limit(4000).returns<TaskLite[]>(),
          [],
        ),
        safe(
          "attendance_records",
          async () =>
            await supabase
              .from("attendance_records")
              .select("id,employee_id,attendance_date,check_in_time,check_out_time,status,total_working_minutes,check_in_address")
              .gte("attendance_date", new Date(Date.now() - 62 * 86400000).toISOString().slice(0, 10))
              .order("attendance_date", { ascending: false })
              .limit(4000)
              .returns<AttendanceLite[]>(),
          [],
        ),
        safe(
          "finance_transactions",
          async () =>
            await supabase.from("finance_transactions").select(TX_SELECT).order("transaction_date", { ascending: false }).limit(2000).returns<FinanceTransactionRow[]>(),
          [],
        ),
        safe(
          "project_payments",
          async () =>
            await supabase.from("project_payments").select("amount,payment_status,project_id").limit(2000).returns<{ amount: number; payment_status: string; project_id: string }[]>(),
          [],
        ),
        safe(
          "project_team_members",
          async () => await supabase.from("project_team_members").select("project_id,profile_id").limit(5000).returns<TeamRow[]>(),
          [],
        ),
      ]);

      setProfiles(pr);
      setClients(cl);
      setProjects(pj);
      setTasks(tk);
      setAttendance(att);
      setFinanceTx(fin);
      setProjectPayments(pay);
      setTeamMembers(tm);
    } catch (e) {
      setLoadError(friendlyReportsError(e));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

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
    const present = rows.filter((a) => (a.status || "").toLowerCase() === "present").length;
    const absent = rows.filter((a) => (a.status || "").toLowerCase() === "absent").length;
    const late = rows.filter((a) => (a.status || "").toLowerCase().includes("late")).length;
    return { present, absent, late, rows };
  }, [attendance]);

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
  const [fltAttFrom, setFltAttFrom] = useState(() => new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
  const [fltAttTo, setFltAttTo] = useState(todayISO);
  const [fltAttEmp, setFltAttEmp] = useState("");
  const [fltClientSource, setFltClientSource] = useState("");
  const [fltClientStatus, setFltClientStatus] = useState("");
  const [fltProjMgr, setFltProjMgr] = useState("");
  const [fltProjStatus, setFltProjStatus] = useState("");
  const [fltTaskEmp, setFltTaskEmp] = useState("");
  const [fltTaskStatus, setFltTaskStatus] = useState("");
  const [fltTaskProject, setFltTaskProject] = useState("");

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (fltDept && (p.department || "") !== fltDept) return false;
      if (fltRole && (p.role || "") !== fltRole) return false;
      if (fltEmpStatus && (p.status || "active") !== fltEmpStatus) return false;
      return true;
    });
  }, [profiles, fltDept, fltEmpStatus, fltRole]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter((a) => {
      const d = String(a.attendance_date).slice(0, 10);
      if (fltAttFrom && d < fltAttFrom) return false;
      if (fltAttTo && d > fltAttTo) return false;
      if (fltAttEmp && a.employee_id !== fltAttEmp) return false;
      if (fltDept && a.employee_id) {
        const dep = profiles.find((p) => p.id === a.employee_id)?.department || "";
        if (dep !== fltDept) return false;
      }
      return true;
    });
  }, [attendance, fltAttEmp, fltAttFrom, fltAttTo, fltDept, profiles]);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (fltClientSource && !(c.source || "").toLowerCase().includes(fltClientSource.toLowerCase())) return false;
      if (fltClientStatus && normalizeStatus(String(c.status)) !== normalizeStatus(fltClientStatus)) return false;
      return true;
    });
  }, [clients, fltClientSource, fltClientStatus]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (fltProjMgr && String(p.project_manager || "") !== fltProjMgr) return false;
      if (fltProjStatus && normalizeProjectStatus(String(p.status)) !== fltProjStatus) return false;
      return true;
    });
  }, [fltProjMgr, fltProjStatus, projects]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (fltTaskEmp && t.assigned_to !== fltTaskEmp) return false;
      if (fltTaskStatus && t.status !== fltTaskStatus) return false;
      if (fltTaskProject && String(t.project_id || "") !== fltTaskProject) return false;
      return true;
    });
  }, [fltTaskEmp, fltTaskProject, fltTaskStatus, tasks]);

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
    const t = taskStats.total ? (taskStats.completed / taskStats.total) * 50 : 0;
    const a = Math.min(50, attendanceRateOverall * 0.5);
    return Math.round(Math.min(100, t + a));
  }, [attendanceRateOverall, taskStats]);

  return (
    <section className="space-y-5 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Reports &amp; Analytics</h2>
          <p className="mt-1 text-xs text-[#64748b] sm:text-sm">View real-time business insights, company analytics and operational reports.</p>
        </div>
        <Button variant="outline" className="h-9 rounded-full border-[#cfdceb]" disabled={loading} onClick={() => void loadAll()}>
          Refresh data
        </Button>
      </header>

      {loadError ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{loadError}</div> : null}

      <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-2">
        <div className="flex min-w-max gap-2">
          {REPORTS_TAB_ORDER.map((tid) => (
            <button
              key={tid}
              type="button"
              onClick={() => setActiveTab(tid)}
              className={
                activeTab === tid
                  ? "rounded-xl bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white shadow-md"
                  : "rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-[#eaf1ff]"
              }
            >
              {REPORTS_TAB_LABELS[tid]}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard title="Total employees" value={profiles.length} loading={loading} />
            <StatCard title="Active employees" value={activeEmployees.length} loading={loading} />
            <StatCard title="Total clients" value={clients.length} loading={loading} />
            <StatCard title="Active projects" value={projectStats.active} loading={loading} />
            <StatCard title="Total tasks" value={taskStats.total} loading={loading} />
            <StatCard title="Completed tasks" value={taskStats.completed} loading={loading} />
            <StatCard title="Monthly revenue" value={formatInr(financeStats.revThis)} loading={loading} />
            <StatCard title="Monthly expenses" value={formatInr(financeStats.expThis)} loading={loading} />
            <StatCard title="Net profit (all tx)" value={formatInr(financeStats.net)} loading={loading} />
            <StatCard title="Attendance rate %" value={`${attendanceRateOverall}%`} loading={loading} subtitle="Last ~60d records" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Monthly revenue growth</p>
              <p className="mt-1 text-xs text-[#64748b]">MoM income: {financeStats.growth}% (vs last month)</p>
              <div className="mt-3 space-y-2">
                {monthlyRevTrend.map(([k, v]) => (
                  <BarRow key={k} label={k} value={v} max={Math.max(1, ...monthlyRevTrend.map((x) => x[1]))} />
                ))}
                {!monthlyRevTrend.length ? <p className="text-xs text-[#64748b]">No finance transactions yet.</p> : null}
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

      {activeTab === "employees" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total employees" value={profiles.length} loading={loading} />
            <StatCard title="Active" value={activeEmployees.length} loading={loading} />
            <StatCard title="Inactive" value={inactiveEmployees.length} loading={loading} />
            <StatCard title="Departments" value={distinctDepts.length} loading={loading} />
          </div>
          <FilterBar>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltDept} onChange={(e) => setFltDept(e.target.value)}>
              <option value="">Department</option>
              {distinctDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltRole} onChange={(e) => setFltRole(e.target.value)}>
              <option value="">Role</option>
              {["super_admin", "admin", "manager", "employee", "accounts"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltEmpStatus} onChange={(e) => setFltEmpStatus(e.target.value)}>
              <option value="">Status</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </FilterBar>
          <ScrollTable
            columns={["Employee", "Role", "Department", "Attendance %", "Tasks", "Done", "Projects", "Rating"]}
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
                  <td className="px-3 py-2">{rating}</td>
                </tr>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Present today" value={attendanceToday.present} loading={loading} />
            <StatCard title="Absent today" value={attendanceToday.absent} loading={loading} />
            <StatCard title="Late / flagged" value={attendanceToday.late} loading={loading} />
            <StatCard title="Avg attendance %" value={`${attendanceRateOverall}%`} loading={loading} subtitle="In loaded window" />
          </div>
          <FilterBar>
            <Input type="date" className="h-9 border-[#d4deea]" value={fltAttFrom} onChange={(e) => setFltAttFrom(e.target.value)} />
            <Input type="date" className="h-9 border-[#d4deea]" value={fltAttTo} onChange={(e) => setFltAttTo(e.target.value)} />
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltAttEmp} onChange={(e) => setFltAttEmp(e.target.value)}>
              <option value="">Employee</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltDept} onChange={(e) => setFltDept(e.target.value)}>
              <option value="">Department</option>
              {distinctDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </FilterBar>
          <ScrollTable
            columns={["Employee", "Date", "Check-in", "Check-out", "Hours", "Status", "Location"]}
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
                <td className="max-w-[180px] truncate px-3 py-2 text-xs">{a.check_in_address || "—"}</td>
              </tr>
            )}
          />
        </div>
      ) : null}

      {activeTab === "clients" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total records" value={clients.length} loading={loading} />
            <StatCard title="Converted" value={clientStats.converted} loading={loading} />
            <StatCard title="Lost" value={clientStats.lost} loading={loading} />
            <StatCard title="Conversion rate %" value={`${clientStats.rate}%`} loading={loading} subtitle="Converted / all" />
          </div>
          <FilterBar>
            <Input className="h-9 border-[#d4deea]" placeholder="Lead source" value={fltClientSource} onChange={(e) => setFltClientSource(e.target.value)} />
            <Input className="h-9 border-[#d4deea]" placeholder="Status (exact)" value={fltClientStatus} onChange={(e) => setFltClientStatus(e.target.value)} />
          </FilterBar>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-[#0f172a]">Lead source report</p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {sourceBreakdown.map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span className="font-medium">{v}</span>
                  </li>
                ))}
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
            columns={["Name", "Company", "Status", "Source", "Service", "Proposal", "Budget"]}
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
          />
        </div>
      ) : null}

      {activeTab === "projects" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Active" value={projectStats.active} loading={loading} />
            <StatCard title="Completed" value={projectStats.completed} loading={loading} />
            <StatCard title="Delayed" value={projectStats.delayed} loading={loading} />
            <StatCard title="Avg completion %" value={`${projectStats.avgProgress}%`} loading={loading} />
          </div>
          <FilterBar>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltProjMgr} onChange={(e) => setFltProjMgr(e.target.value)}>
              <option value="">Project manager</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltProjStatus} onChange={(e) => setFltProjStatus(e.target.value)}>
              <option value="">Status</option>
              {["Planning", "Active", "On Hold", "In Review", "Completed", "Cancelled", "Delayed"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FilterBar>
          <ScrollTable
            columns={["Project", "Client", "Manager", "Budget", "Pending", "Progress", "Status", "Deadline"]}
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
          />
        </div>
      ) : null}

      {activeTab === "tasks" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total tasks" value={taskStats.total} loading={loading} />
            <StatCard title="Completed" value={taskStats.completed} loading={loading} />
            <StatCard title="Pending" value={taskStats.pending} loading={loading} />
            <StatCard title="Delayed" value={taskStats.delayed} loading={loading} />
          </div>
          <FilterBar>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltTaskEmp} onChange={(e) => setFltTaskEmp(e.target.value)}>
              <option value="">Employee</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltTaskStatus} onChange={(e) => setFltTaskStatus(e.target.value)}>
              <option value="">Status</option>
              {["Pending", "In Progress", "Completed"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-lg border border-[#d4deea] bg-white px-2 text-sm" value={fltTaskProject} onChange={(e) => setFltTaskProject(e.target.value)}>
              <option value="">Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_name}
                </option>
              ))}
            </select>
          </FilterBar>
          <ScrollTable
            columns={["Task ID", "Assignee", "Project", "Priority", "Status", "Due"]}
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
          />
        </div>
      ) : null}

      {activeTab === "finance" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard title="Total revenue" value={formatInr(financeStats.rev)} loading={loading} />
            <StatCard title="Total expenses" value={formatInr(financeStats.exp)} loading={loading} />
            <StatCard title="Net profit" value={formatInr(financeStats.net)} loading={loading} />
            <StatCard title="Pending dues" value={formatInr(financeStats.pendingDues)} loading={loading} />
            <StatCard title="Monthly revenue" value={formatInr(financeStats.revThis)} loading={loading} />
            <StatCard title="Monthly expense" value={formatInr(financeStats.expThis)} loading={loading} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Productivity score" value={productivityScore} loading={loading} subtitle="Tasks + attendance blend" />
            <StatCard title="Task completion %" value={taskStats.total ? Math.round((taskStats.completed / taskStats.total) * 1000) / 10 : 0} loading={loading} />
            <StatCard title="Revenue growth (MoM)" value={`${financeStats.growth}%`} loading={loading} />
            <StatCard title="Attendance %" value={`${attendanceRateOverall}%`} loading={loading} />
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
        <div className="rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-6 text-sm text-[#475569]">
          <p className="font-semibold text-[#0f172a]">Export center</p>
          <p className="mt-2">Server-side PDF/Excel/CSV generation can be wired to Edge Functions or an API route. Buttons below are placeholders.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" disabled title="Coming soon">
              Export PDF
            </Button>
            <Button type="button" variant="outline" className="rounded-full" disabled title="Coming soon">
              Export Excel
            </Button>
            <Button type="button" variant="outline" className="rounded-full" disabled title="Coming soon">
              Export CSV
            </Button>
          </div>
          <ul className="mt-4 list-inside list-disc text-xs text-[#64748b]">
            <li>Employee reports</li>
            <li>Attendance reports</li>
            <li>Finance reports</li>
            <li>Project reports</li>
            <li>Client reports</li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-2 rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-3">{children}</div>;
}

function ScrollTable<T>({
  columns,
  rows,
  loading,
  renderRow,
}: {
  columns: string[];
  rows: T[];
  loading: boolean;
  renderRow: (row: T) => ReactNode;
}) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-semibold">
                {c}
              </th>
            ))}
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
  );
}
