"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  ListChecks,
  Plus,
  Search,
  TrendingUp,
  UserCheck2,
  UsersRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchOrEmpty, formatBatchAccessWarning, type SupabaseQueryError } from "@/lib/supabase/clientQuery";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { AttendanceSelfieThumb } from "@/components/attendance/AttendanceSelfieThumb";
import { StatCard } from "@/components/dashboard/StatCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DateFilter = "today" | "week" | "month" | "year";
type Profile = { id: string; full_name: string | null; email: string | null; department: string | null; role?: string | null; status: string | null; created_at: string };
type Attendance = {
  id?: string;
  employee_id: string | null;
  attendance_date: string;
  status: string | null;
  check_in_time: string | null;
  check_in_selfie_url?: string | null;
  total_working_minutes: number | null;
  created_at: string;
};
type Client = { id: string; name: string; company_name: string | null; status: string | null; follow_up_date: string | null; created_at: string; updated_at: string };
type Project = { id: string; project_name: string; client_id: string | null; deadline: string | null; status: string | null; progress: number | null; pending_amount: number | null; created_at: string; updated_at: string };
type Task = { id: string; assigned_to: string; status: string; due_date: string | null; project_id: string | null; created_at: string; updated_at: string };
type Tx = { id: string; transaction_type: "Income" | "Expense"; amount: number; transaction_date: string; payment_status: string | null; created_at: string };
type Team = { project_id: string; profile_id: string };
type Claim = { approval_status: string | null };
type Permission = { status: string | null };
type Wfh = { status: string | null };
type ActivityRow = { id: string; title: string; module: string; status: string; at: string };

const PIE_COLORS = ["#c9a227", "#d4b84a", "#a68b2e", "#10b981", "#f59e0b", "#6b5d4d"];

/** PostgREST 404 / missing relation — tables not created in this Supabase project yet. */
const SKIP_PERM_SESSION_KEY = "bb_admin_dashboard_skip_rest_permission_requests";
const SKIP_WFH_SESSION_KEY = "bb_admin_dashboard_skip_rest_wfh_requests";

function isMissingRelationError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "42P01") return true;
  const m = (err.message || "").toLowerCase();
  return m.includes("schema cache") || m.includes("does not exist") || m.includes("could not find the table");
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const formatInr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const attStatus = (s: string | null | undefined) => {
  const v = (s || "").toLowerCase();
  if (v.includes("present")) return "Present";
  if (v.includes("late")) return "Late";
  if (v.includes("absent")) return "Absent";
  if (v.includes("leave")) return "Leave";
  if (v.includes("wfh")) return "WFH";
  return s || "Unknown";
};
const leadStage = (s: string | null | undefined) => {
  const v = (s || "").toLowerCase();
  if (v.includes("convert")) return "Converted";
  if (v.includes("lost")) return "Lost";
  if (v.includes("contact")) return "Contacted";
  if (v.includes("negoti")) return "Negotiation";
  if (v.includes("proposal")) return "Proposal Sent";
  return "New Lead";
};
const projectStatus = (s: string | null | undefined) => (s || "Planning").trim() || "Planning";
const trend = (cur: number, prev: number) => {
  if (prev === 0) return cur === 0 ? "0.0%" : "+100.0%";
  const p = ((cur - prev) / prev) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
};

function getRange(filter: DateFilter) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (filter === "week") start.setDate(start.getDate() - 6);
  if (filter === "month") start.setDate(1);
  if (filter === "year") start.setMonth(0, 1);
  return { start, end: now };
}
function getPrevRange(filter: DateFilter) {
  const cur = getRange(filter);
  const span = cur.end.getTime() - cur.start.getTime();
  const end = new Date(cur.start.getTime() - 1);
  const start = new Date(end.getTime() - span);
  return { start, end };
}
function inRange(dateStr: string | null | undefined, range: { start: Date; end: Date }) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= range.start && d <= range.end;
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export default function AdminDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [search, setSearch] = useState("");
  const [attWindow, setAttWindow] = useState<"week" | "month">("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attendanceSchemaWarning, setAttendanceSchemaWarning] = useState<string | null>(null);
  const [skipAttendanceOpsFetch, setSkipAttendanceOpsFetch] = useState(false);
  const [userName, setUserName] = useState("Admin");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [teamMembers, setTeamMembers] = useState<Team[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [wfh, setWfh] = useState<Wfh[]>([]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: me } = await supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
        setUserName((me?.full_name as string | null) || (me?.email as string | null) || "Admin");
      }

      const queryErrors: SupabaseQueryError[] = [];

      const [pr, at, cl, pj, tk, tx, tm, ec] = await Promise.all([
        fetchOrEmpty(
          "profiles",
          supabase.from("profiles").select("id,full_name,email,department,role,status,created_at").limit(3000).returns<Profile[]>(),
          queryErrors,
          [],
        ),
        fetchOrEmpty(
          "attendance_records",
          supabase
            .from("attendance_records")
            .select("id,employee_id,attendance_date,status,check_in_time,check_in_selfie_url,total_working_minutes,created_at")
            .gte("attendance_date", isoDate(new Date(Date.now() - 120 * 86400000)))
            .limit(12000)
            .returns<Attendance[]>(),
          queryErrors,
          [],
        ),
        fetchOrEmpty(
          "clients",
          supabase.from("clients").select("id,name,company_name,status,follow_up_date,created_at,updated_at").limit(10000).returns<Client[]>(),
          queryErrors,
          [],
        ),
        fetchOrEmpty(
          "projects",
          supabase.from("projects").select("id,project_name,client_id,deadline,status,progress,pending_amount,created_at,updated_at").limit(6000).returns<Project[]>(),
          queryErrors,
          [],
        ),
        fetchOrEmpty(
          "tasks",
          supabase.from("tasks").select("id,assigned_to,status,due_date,project_id,created_at,updated_at").limit(15000).returns<Task[]>(),
          queryErrors,
          [],
        ),
        fetchOrEmpty(
          "finance_transactions",
          supabase.from("finance_transactions").select("id,transaction_type,amount,transaction_date,payment_status,created_at").limit(12000).returns<Tx[]>(),
          queryErrors,
          [],
        ),
        fetchOrEmpty(
          "project_team_members",
          supabase.from("project_team_members").select("project_id,profile_id").limit(12000).returns<Team[]>(),
          queryErrors,
          [],
        ),
        fetchOrEmpty(
          "expense_claims",
          supabase.from("expense_claims").select("approval_status").limit(5000).returns<Claim[]>(),
          queryErrors,
          [],
        ),
      ]);

      const w = typeof window !== "undefined";
      const skipP = w && sessionStorage.getItem(SKIP_PERM_SESSION_KEY) === "1";
      const skipW = w && sessionStorage.getItem(SKIP_WFH_SESSION_KEY) === "1";

      const [pmR, wfR] = await Promise.all([
        skipP
          ? Promise.resolve({ data: [] as Permission[] | null, error: null })
          : supabase.from("permission_requests").select("status").limit(5000).returns<Permission[]>(),
        skipW
          ? Promise.resolve({ data: [] as Wfh[] | null, error: null })
          : supabase.from("work_from_home_requests").select("status").limit(5000).returns<Wfh[]>(),
      ]);

      if (w) {
        if (!pmR.error) sessionStorage.removeItem(SKIP_PERM_SESSION_KEY);
        else if (isMissingRelationError(pmR.error)) sessionStorage.setItem(SKIP_PERM_SESSION_KEY, "1");
        if (!wfR.error) sessionStorage.removeItem(SKIP_WFH_SESSION_KEY);
        else if (isMissingRelationError(wfR.error)) sessionStorage.setItem(SKIP_WFH_SESSION_KEY, "1");
      }

      const pm: Permission[] = !pmR.error ? (pmR.data ?? []) : [];
      const wf: Wfh[] = !wfR.error ? (wfR.data ?? []) : [];

      const rtSkip =
        w &&
        (sessionStorage.getItem(SKIP_PERM_SESSION_KEY) === "1" ||
          sessionStorage.getItem(SKIP_WFH_SESSION_KEY) === "1");
      setSkipAttendanceOpsFetch(Boolean(rtSkip));
      setAttendanceSchemaWarning(
        rtSkip
          ? "Some attendance tables are missing in Supabase (permission_requests and/or work_from_home_requests return REST 404). The rest of the dashboard still works. In SQL Editor run AJ_Academy_SB/attendance_module.sql (see DATABASE_SETUP_ORDER.txt). After the tables exist, click Retry."
          : null,
      );

      setProfiles(pr);
      setAttendance(at);
      setClients(cl);
      setProjects(pj);
      setTasks(tk);
      setTransactions(tx);
      setTeamMembers(tm);
      setClaims(ec);
      setPermissions(pm);
      setWfh(wf);

      const accessWarning = formatBatchAccessWarning(queryErrors);
      if (accessWarning) setError(accessWarning);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const scheduleLoad = useDebouncedCallback(() => {
    void load({ silent: true });
  }, 3000);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let ch = supabase
      .channel("admin-dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_records" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "finance_transactions" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_claims" }, scheduleLoad);
    if (!skipAttendanceOpsFetch) {
      ch = ch
        .on("postgres_changes", { event: "*", schema: "public", table: "permission_requests" }, scheduleLoad)
        .on("postgres_changes", { event: "*", schema: "public", table: "work_from_home_requests" }, scheduleLoad);
    }
    void ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [scheduleLoad, supabase, skipAttendanceOpsFetch]);

  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach((p) => {
      m[p.id] = p.full_name || p.email || p.id.slice(0, 8);
    });
    return m;
  }, [profiles]);

  const clientMap = useMemo(() => {
    const m: Record<string, string> = {};
    clients.forEach((c) => {
      m[c.id] = c.company_name || c.name;
    });
    return m;
  }, [clients]);

  const range = useMemo(() => getRange(dateFilter), [dateFilter]);
  const prev = useMemo(() => getPrevRange(dateFilter), [dateFilter]);
  const today = isoDate(new Date());

  const activeEmployees = profiles.filter((p) => (p.status || "active").toLowerCase() === "active");
  const attendanceToday = attendance.filter((a) => String(a.attendance_date).slice(0, 10) === today);
  const presentToday = attendanceToday.filter((a) => attStatus(a.status) === "Present").length;
  const lateToday = attendanceToday.filter((a) => attStatus(a.status) === "Late").length;
  const absentToday = Math.max(0, activeEmployees.length - presentToday);

  const activeProjects = projects.filter((p) => projectStatus(p.status).toLowerCase() === "active").length;
  const completedProjects = projects.filter((p) => projectStatus(p.status).toLowerCase() === "completed").length;
  const pendingTasks = tasks.filter((t) => t.status !== "Completed").length;
  const completedTasks = tasks.filter((t) => t.status === "Completed").length;
  const totalLeads = clients.length;
  const convertedClients = clients.filter((c) => leadStage(c.status) === "Converted").length;

  const revenue = transactions.filter((t) => t.transaction_type === "Income" && inRange(t.transaction_date, range)).reduce((a, t) => a + Number(t.amount), 0);
  const expenses = transactions.filter((t) => t.transaction_type === "Expense" && inRange(t.transaction_date, range)).reduce((a, t) => a + Number(t.amount), 0);
  const prevRevenue = transactions.filter((t) => t.transaction_type === "Income" && inRange(t.transaction_date, prev)).reduce((a, t) => a + Number(t.amount), 0);
  const prevExpenses = transactions.filter((t) => t.transaction_type === "Expense" && inRange(t.transaction_date, prev)).reduce((a, t) => a + Number(t.amount), 0);
  const netProfit = revenue - expenses;

  const attendancePct = activeEmployees.length ? (presentToday / activeEmployees.length) * 100 : 0;
  const projectCompletionPct = projects.length ? projects.reduce((a, p) => a + Number(p.progress || 0), 0) / projects.length : 0;
  const taskCompletionPct = tasks.length ? (completedTasks / tasks.length) * 100 : 0;
  const financeGrowthPct = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : revenue > 0 ? 100 : 0;
  const financeGrowthScore = Math.max(0, Math.min(100, 50 + financeGrowthPct));
  const operationsScore = (attendancePct + projectCompletionPct + taskCompletionPct + financeGrowthScore) / 4;

  const attendanceTrend = useMemo(() => {
    const days = attWindow === "week" ? 7 : 30;
    return Array.from({ length: days }).map((_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - idx));
      const key = isoDate(d);
      const rows = attendance.filter((a) => String(a.attendance_date).slice(0, 10) === key);
      const present = rows.filter((x) => attStatus(x.status) === "Present").length;
      const late = rows.filter((x) => attStatus(x.status) === "Late").length;
      const absent = Math.max(0, activeEmployees.length - present - late);
      return { day: key.slice(5), present, late, absent };
    });
  }, [activeEmployees.length, attWindow, attendance]);

  const monthlyFinance = useMemo(() => {
    const m: Record<string, { month: string; revenue: number; expenses: number; profit: number }> = {};
    transactions.forEach((t) => {
      const k = monthKey(t.transaction_date);
      if (!m[k]) m[k] = { month: k, revenue: 0, expenses: 0, profit: 0 };
      if (t.transaction_type === "Income") m[k].revenue += Number(t.amount);
      else m[k].expenses += Number(t.amount);
    });
    return Object.values(m)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((x) => ({ ...x, profit: x.revenue - x.expenses }));
  }, [transactions]);

  const projectStatusData = useMemo(() => {
    const m: Record<string, number> = {};
    projects.forEach((p) => {
      const s = projectStatus(p.status);
      m[s] = (m[s] || 0) + 1;
    });
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [projects]);

  const taskProductivity = useMemo(() => {
    const m: Record<string, number> = {};
    tasks.forEach((t) => {
      if (t.status !== "Completed") return;
      m[t.assigned_to] = (m[t.assigned_to] || 0) + 1;
    });
    return Object.entries(m)
      .map(([id, done]) => ({ employee: nameMap[id] || id.slice(0, 8), done }))
      .sort((a, b) => b.done - a.done)
      .slice(0, 8);
  }, [nameMap, tasks]);

  const activity = useMemo<ActivityRow[]>(() => {
    const rows: ActivityRow[] = [];
    attendance.slice(0, 80).forEach((a, i) => {
      if (!a.employee_id) return;
      rows.push({ id: `att-${i}`, title: `${nameMap[a.employee_id] || "Employee"} marked ${attStatus(a.status)}`, module: "Attendance", status: attStatus(a.status), at: a.created_at });
    });
    tasks.slice(0, 80).forEach((t) => {
      rows.push({ id: `task-${t.id}`, title: `Task ${t.id.slice(0, 8)} changed to ${t.status}`, module: "Task", status: t.status, at: t.updated_at });
    });
    projects.slice(0, 80).forEach((p) => {
      rows.push({ id: `project-${p.id}`, title: `${p.project_name} is ${projectStatus(p.status)}`, module: "Project", status: projectStatus(p.status), at: p.updated_at });
    });
    clients.slice(0, 80).forEach((c) => {
      rows.push({ id: `client-${c.id}`, title: `${c.company_name || c.name} is ${leadStage(c.status)}`, module: "Lead", status: leadStage(c.status), at: c.updated_at });
    });
    transactions.slice(0, 80).forEach((t) => {
      rows.push({ id: `tx-${t.id}`, title: `${t.transaction_type} ${formatInr(Number(t.amount))}`, module: "Finance", status: t.payment_status || t.transaction_type, at: t.created_at });
    });
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (q ? `${r.title} ${r.module} ${r.status}`.toLowerCase().includes(q) : true))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 24);
  }, [attendance, clients, nameMap, projects, search, tasks, transactions]);

  const pendingApprovals =
    claims.filter((x) => (x.approval_status || "").toLowerCase() === "pending").length +
    permissions.filter((x) => (x.status || "").toLowerCase() === "pending").length +
    wfh.filter((x) => (x.status || "").toLowerCase() === "pending").length;

  const overdueTasks = tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "Completed").length;
  const dueFollowups = clients.filter((c) => c.follow_up_date && c.follow_up_date <= today).length;
  const projectDeadlines = projects.filter((p) => p.deadline && p.deadline >= today && p.deadline <= isoDate(new Date(Date.now() + 7 * 86400000))).length;
  const pendingPayments = projects.reduce((a, p) => a + Number(p.pending_amount || 0), 0);
  const activeMeetings = attendanceToday.filter((a) => (a.check_in_time || "").toLowerCase().includes("t")).length;

  const todayFreelancerSelfies = useMemo(() => {
    return attendanceToday
      .filter((a) => {
        if (!a.check_in_selfie_url || !a.employee_id) return false;
        const p = profiles.find((pr) => pr.id === a.employee_id);
        return (p?.role ?? "").toLowerCase() === "freelancer";
      })
      .map((a) => ({
        id: a.id ?? a.employee_id!,
        selfie: a.check_in_selfie_url!,
        name: nameMap[a.employee_id!] ?? "Freelancer",
        checkIn: a.check_in_time
          ? new Date(a.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "—",
        status: attStatus(a.status),
      }));
  }, [attendanceToday, nameMap, profiles]);

  const activeProjectRows = useMemo(() => {
    return projects
      .filter((p) => projectStatus(p.status).toLowerCase() === "active")
      .map((p) => ({ ...p, teamCount: teamMembers.filter((tm) => tm.project_id === p.id).length, clientName: p.client_id ? clientMap[p.client_id] || "—" : "—" }))
      .slice(0, 10);
  }, [clientMap, projects, teamMembers]);

  const kpiCards = [
    { title: "Total Employees", value: `${activeEmployees.length}`, trendVal: trend(activeEmployees.length, profiles.filter((p) => inRange(p.created_at, prev)).length), icon: UsersRound, description: "Active employees in system." },
    { title: "Present Today", value: `${presentToday}`, trendVal: trend(presentToday, attendance.filter((a) => String(a.attendance_date).slice(0, 10) === isoDate(new Date(Date.now() - 86400000)) && attStatus(a.status) === "Present").length), icon: UserCheck2, description: "Today's present check-ins." },
    { title: "Absent Today", value: `${absentToday}`, trendVal: trend(absentToday, 0), icon: UserCheck2, description: "Employees not marked present." },
    { title: "Active Projects", value: `${activeProjects}`, trendVal: trend(activeProjects, projects.filter((p) => projectStatus(p.status).toLowerCase() === "active" && inRange(p.created_at, prev)).length), icon: BriefcaseBusiness, description: "Projects currently active." },
    { title: "Completed Projects", value: `${completedProjects}`, trendVal: trend(completedProjects, projects.filter((p) => projectStatus(p.status).toLowerCase() === "completed" && inRange(p.updated_at, prev)).length), icon: CheckCircle2, description: "Projects completed overall." },
    { title: "Pending Tasks", value: `${pendingTasks}`, trendVal: trend(pendingTasks, tasks.filter((t) => t.status !== "Completed" && inRange(t.updated_at, prev)).length), icon: ClipboardList, description: "Open tasks awaiting completion." },
    { title: "Completed Tasks", value: `${completedTasks}`, trendVal: trend(completedTasks, tasks.filter((t) => t.status === "Completed" && inRange(t.updated_at, prev)).length), icon: ListChecks, description: "Completed tasks overall." },
    { title: "Total Leads", value: `${totalLeads}`, trendVal: trend(totalLeads, clients.filter((c) => inRange(c.created_at, prev)).length), icon: UsersRound, description: "Lead/client records." },
    { title: "Converted Clients", value: `${convertedClients}`, trendVal: trend(convertedClients, clients.filter((c) => leadStage(c.status) === "Converted" && inRange(c.updated_at, prev)).length), icon: UsersRound, description: "Converted pipeline records." },
    { title: "Monthly Revenue", value: formatInr(revenue), trendVal: trend(revenue, prevRevenue), icon: CircleDollarSign, description: "Income transactions in range." },
    { title: "Monthly Expenses", value: formatInr(expenses), trendVal: trend(expenses, prevExpenses), icon: CircleDollarSign, description: "Expense transactions in range." },
    { title: "Net Profit", value: formatInr(netProfit), trendVal: trend(netProfit, prevRevenue - prevExpenses), icon: TrendingUp, description: "Revenue - expenses." },
    { title: "Attendance %", value: `${attendancePct.toFixed(1)}%`, trendVal: trend(attendancePct, 0), icon: UserCheck2, description: "Present / active employees today." },
    { title: "Operations Score", value: `${operationsScore.toFixed(1)}%`, trendVal: trend(operationsScore, 50), icon: TrendingUp, description: "Attendance + project + task + finance growth." },
  ];

  return (
    <section className="dashboard-section space-y-6 rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <header className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="min-w-0">
          <p className="aj-page-label">Company Operations Control Center</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#3d3428] sm:text-3xl">Admin Dashboard</h2>
          <p className="mt-1 text-sm text-[#6b5d4d]">{new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
        <div className="hidden" aria-hidden>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activities" className="h-10 rounded-full border-[#e8dcc8] bg-[#f8fbff] pl-9" />
        </div>
        <div className="-mx-1 flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:flex-wrap xl:justify-end xl:overflow-visible xl:px-0 xl:pb-0">
          <Button variant="outline" size="icon" className="rounded-full border-[#e8dcc8]"><Bell className="h-4 w-4" /></Button>
          <Button className="rounded-full bg-[#c9a227] px-3 text-white hover:bg-[#b8921f]"><Plus className="mr-1 h-4 w-4" />Quick Action</Button>
          <Avatar size="sm" className="border border-[#e8dcc8] bg-[#faf3e3]"><AvatarFallback>{initials(userName)}</AvatarFallback></Avatar>
          <Link href="/admin/reports"><Button variant="outline" className="rounded-full border-[#e8dcc8]"><FileText className="mr-1 h-4 w-4" />Generate Report</Button></Link>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)} className="h-10 rounded-full border border-[#e8dcc8] bg-white px-3 text-sm text-[#334155]">
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </header>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

      {attendanceSchemaWarning ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            <p className="leading-relaxed">{attendanceSchemaWarning}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.removeItem(SKIP_PERM_SESSION_KEY);
                sessionStorage.removeItem(SKIP_WFH_SESSION_KEY);
              }
              setSkipAttendanceOpsFetch(false);
              setAttendanceSchemaWarning(null);
              void load();
            }}
          >
            Retry after SQL
          </Button>
        </div>
      ) : null}

      <div className="stat-cards-grid">
        {kpiCards.map((item) => (
          <StatCard key={item.title} title={item.title} value={loading ? "…" : item.value} trend={item.trendVal} description={item.description} icon={item.icon} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#3d3428]">Attendance Trend</h3>
            <div className="flex gap-1">
              <Button variant={attWindow === "week" ? "default" : "outline"} className="h-8 rounded-full px-3 text-xs" onClick={() => setAttWindow("week")}>Weekly</Button>
              <Button variant={attWindow === "month" ? "default" : "outline"} className="h-8 rounded-full px-3 text-xs" onClick={() => setAttWindow("month")}>Monthly</Button>
            </div>
          </div>
          <div className="h-[260px] min-h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="present" stackId="1" stroke="#10b981" fill="#34d399" />
                <Area type="monotone" dataKey="late" stackId="1" stroke="#f59e0b" fill="#fbbf24" />
                <Area type="monotone" dataKey="absent" stackId="1" stroke="#ef4444" fill="#f87171" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-base font-semibold text-[#3d3428]">Revenue vs Expense</h3>
          <div className="h-[260px] min-h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyFinance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" fill="#c9a227" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-base font-semibold text-[#3d3428]">Project Status Mix</h3>
          <div className="h-[250px] min-h-[250px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={projectStatusData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {projectStatusData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-base font-semibold text-[#3d3428]">Task Productivity</h3>
          <div className="h-[250px] min-h-[250px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taskProductivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="employee" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="done" fill="#c9a227" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-[#3d3428]">Freelancer check-ins today</h3>
          <Link href="/admin/attendance?tab=logs" className="text-xs font-medium text-[#a68b2e] hover:underline">
            View all attendance logs →
          </Link>
        </div>
        <div className="responsive-table-wrap">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-[#faf3e3] text-xs uppercase text-[#6b5d4d]">
              <tr>
                {["Selfie", "Name", "Check-in", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todayFreelancerSelfies.map((row) => (
                <tr key={row.id} className="border-t border-[#eef2ff]">
                  <td className="px-3 py-2">
                    <AttendanceSelfieThumb url={row.selfie} alt={`${row.name} selfie`} size="md" />
                  </td>
                  <td className="px-3 py-2 font-medium">{row.name}</td>
                  <td className="px-3 py-2">{row.checkIn}</td>
                  <td className="px-3 py-2">{row.status}</td>
                </tr>
              ))}
              {!todayFreelancerSelfies.length && !loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-[#6b5d4d]">
                    No freelancer selfie check-ins today.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm xl:col-span-7">
          <h3 className="mb-3 text-base font-semibold text-[#3d3428]">Activity Timeline</h3>
          <div className="max-h-[340px] space-y-2 overflow-auto pr-1">
            {activity.map((row) => (
              <div key={row.id} className="rounded-lg border border-[#e8edf5] bg-[#fbfdff] p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#3d3428]">{row.title}</p>
                    <p className="text-xs text-[#6b5d4d]">{row.module}</p>
                  </div>
                  <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-xs font-medium text-[#334155]">{row.status}</span>
                </div>
                <p className="mt-1 text-xs text-[#94a3b8]">{new Date(row.at).toLocaleString()}</p>
              </div>
            ))}
            {!activity.length && !loading ? <p className="rounded-lg border border-dashed border-[#e8dcc8] p-5 text-sm text-[#6b5d4d]">No activities found.</p> : null}
          </div>
        </section>

        <section className="space-y-3 rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm xl:col-span-5">
          <h3 className="text-base font-semibold text-[#3d3428]">Today's Operations</h3>
          <OpRow label="Today Attendance" value={`${presentToday}/${activeEmployees.length}`} />
          <OpRow label="Permission Requests (Pending)" value={permissions.filter((x) => (x.status || "").toLowerCase() === "pending").length} />
          <OpRow label="Active Meetings" value={activeMeetings} />
          <OpRow label="Pending Approvals" value={pendingApprovals} />
          <OpRow label="Due Follow-ups" value={dueFollowups} />
          <OpRow label="Overdue Tasks" value={overdueTasks} tone="rose" />
          <OpRow label="Project Deadlines (7d)" value={projectDeadlines} tone="amber" />
          <OpRow label="Pending Payments" value={formatInr(pendingPayments)} tone="amber" />
        </section>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-12">
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm xl:col-span-8">
          <h3 className="mb-3 text-base font-semibold text-[#3d3428]">Project Overview (Active)</h3>
          <div className="responsive-table-wrap -mx-1 px-1 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-[#faf3e3] text-xs uppercase text-[#6b5d4d]">
                <tr>
                  <th className="px-3 py-2 text-left">Project</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Deadline</th>
                  <th className="px-3 py-2 text-left">Progress</th>
                  <th className="px-3 py-2 text-left">Team Count</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeProjectRows.map((p) => (
                  <tr key={p.id} className="border-t border-[#eef2ff]">
                    <td className="px-3 py-2 font-medium">{p.project_name}</td>
                    <td className="px-3 py-2">{p.clientName}</td>
                    <td className="px-3 py-2">{p.deadline || "—"}</td>
                    <td className="px-3 py-2">{Number(p.progress || 0)}%</td>
                    <td className="px-3 py-2">{p.teamCount}</td>
                    <td className="px-3 py-2">{projectStatus(p.status)}</td>
                  </tr>
                ))}
                {!activeProjectRows.length && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[#6b5d4d]">No active projects.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[20px] border border-[#e8dcc8] bg-white p-4 shadow-sm xl:col-span-4">
          <h3 className="mb-3 text-base font-semibold text-[#3d3428]">Finance Snapshot</h3>
          <Metric label="Revenue" value={formatInr(revenue)} />
          <Metric label="Expenses" value={formatInr(expenses)} />
          <Metric label="Profit" value={formatInr(netProfit)} />
          <Metric label="Pending Dues" value={formatInr(pendingPayments)} />
        </section>
      </div>
    </section>
  );
}

function OpRow({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "rose" | "amber" }) {
  return (
    <div
      className={[
        "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
        tone === "rose"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : tone === "amber"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-slate-200 bg-slate-50 text-slate-700",
      ].join(" ")}
    >
      <span>{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[#e8edf5] bg-[#fbfdff] px-3 py-2 text-sm">
      <span className="shrink-0 text-[#6b5d4d]">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-[#3d3428]">{value}</span>
    </div>
  );
}


