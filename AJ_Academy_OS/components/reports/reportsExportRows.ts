import { normalizeStatus } from "@/components/student-lead-master/studentMasterHelpers";
import { normalizeProjectStatus } from "@/components/project-master/projectHelpers";
import type { ReportsTabId } from "@/components/reports/reportsConfig";
import { formatInr, minutesToHoursLabel } from "@/components/reports/reportsHelpers";
import type { ExportRow } from "@/components/reports/reportsExport";
import type { FinanceTransactionRow } from "@/types/finance";
import type { ProjectRow } from "@/types/project";

export type ReportDataTab = Exclude<ReportsTabId, "export">;
export type ExportScope = "filtered" | "all";

export const EXPORT_DATA_TABS: ReportDataTab[] = [
  "overview",
  "employees",
  "attendance",
  "clients",
  "projects",
  "tasks",
  "finance",
  "performance",
];

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

export type ReportExportContext = {
  profiles: ProfileLite[];
  clients: ClientLite[];
  projects: ProjectRow[];
  tasks: TaskLite[];
  attendance: AttendanceLite[];
  financeTx: FinanceTransactionRow[];
  filteredProfiles: ProfileLite[];
  filteredClients: ClientLite[];
  filteredProjects: ProjectRow[];
  filteredTasks: TaskLite[];
  filteredAttendance: AttendanceLite[];
  employeeNameMap: Record<string, string>;
  perEmployeeTaskCounts: Record<string, { total: number; done: number }>;
  perEmployeeAttendanceRate: Record<string, number>;
  perEmployeeProjects: Record<string, Set<string>>;
  distinctDepts: string[];
  activeEmployeesCount: number;
  taskStats: { total: number; completed: number };
  financeStats: { revThis: number; expThis: number; growth: number };
  attendanceRateOverall: number;
  productivityScore: number;
  topPerformers: { p: ProfileLite; score: number; tc: { total: number; done: number } }[];
  bestRevenueProject?: { name: string; amt: number };
  bestRevenueClient?: { name: string; amt: number };
};

export function buildReportExportRows(tab: ReportDataTab, scope: ExportScope, ctx: ReportExportContext): ExportRow[] {
  const profiles = scope === "filtered" ? ctx.filteredProfiles : ctx.profiles;
  const clients = scope === "filtered" ? ctx.filteredClients : ctx.clients;
  const projects = scope === "filtered" ? ctx.filteredProjects : ctx.projects;
  const tasks = scope === "filtered" ? ctx.filteredTasks : ctx.tasks;
  const attendance = scope === "filtered" ? ctx.filteredAttendance : ctx.attendance;

  if (tab === "employees") {
    return profiles.map((p) => {
      const tc = ctx.perEmployeeTaskCounts[p.id] || { total: 0, done: 0 };
      const rating = tc.total ? Math.round((tc.done / tc.total) * 100) : "";
      return {
        employee: p.full_name || p.email || p.id.slice(0, 8),
        role: p.role || "—",
        department: p.department || "—",
        status: p.status || "active",
        attendance_rate_pct: ctx.perEmployeeAttendanceRate[p.id] ?? 0,
        tasks_total: tc.total,
        tasks_completed: tc.done,
        projects_count: ctx.perEmployeeProjects[p.id]?.size ?? 0,
        rating_pct: rating,
      };
    });
  }

  if (tab === "attendance") {
    return attendance.map((a) => ({
      employee: a.employee_id ? ctx.employeeNameMap[a.employee_id] || "—" : "—",
      attendance_date: String(a.attendance_date).slice(0, 10),
      check_in: a.check_in_time ? new Date(a.check_in_time).toLocaleString() : "—",
      check_out: a.check_out_time ? new Date(a.check_out_time).toLocaleString() : "—",
      working_hours: minutesToHoursLabel(a.total_working_minutes),
      status: a.status || "—",
      location: a.check_in_address || "—",
    }));
  }

  if (tab === "clients") {
    return clients.map((c) => ({
      name: c.name,
      company: c.company_name || "—",
      status: normalizeStatus(String(c.status)),
      source: c.source || "—",
      service: c.service_interest || "—",
      proposal: c.proposal_status || "—",
      budget: c.budget ?? "",
    }));
  }

  if (tab === "projects") {
    return projects.map((p) => ({
      project: p.project_name,
      client: p.client_id
        ? ctx.clients.find((c) => c.id === p.client_id)?.company_name ||
          ctx.clients.find((c) => c.id === p.client_id)?.name ||
          "—"
        : "—",
      manager: p.project_manager ? ctx.employeeNameMap[p.project_manager] || "—" : "—",
      budget: p.budget ?? "",
      pending_amount: p.pending_amount ?? 0,
      progress_pct: p.progress ?? 0,
      status: normalizeProjectStatus(String(p.status)),
      deadline: p.deadline ? String(p.deadline).slice(0, 10) : "—",
    }));
  }

  if (tab === "tasks") {
    return tasks.map((t) => ({
      task_id: t.id,
      assignee: ctx.employeeNameMap[t.assigned_to] || t.assigned_to,
      project: t.project_id ? ctx.projects.find((p) => p.id === t.project_id)?.project_name || "—" : "—",
      priority: t.priority,
      status: t.status,
      due_date: t.due_date || "—",
    }));
  }

  if (tab === "finance") {
    return ctx.financeTx.map((t) => ({
      transaction_date: t.transaction_date,
      type: t.transaction_type,
      category: t.category || "—",
      amount: t.amount,
      project: t.project_id
        ? ctx.projects.find((p) => p.id === t.project_id)?.project_name || t.project_id
        : "—",
      client: t.client_id
        ? ctx.clients.find((c) => c.id === t.client_id)?.company_name ||
          ctx.clients.find((c) => c.id === t.client_id)?.name ||
          t.client_id
        : "—",
      description: t.description || "—",
    }));
  }

  if (tab === "performance") {
    const performerRows = ctx.topPerformers.map(({ p, score, tc }) => ({
      report_section: "top_performer",
      employee: p.full_name || p.email || p.id,
      department: p.department || "—",
      task_completion_pct: score,
      tasks_total: tc.total,
      tasks_completed: tc.done,
    }));
    const deptRows = ctx.distinctDepts.map((d) => {
      const emps = ctx.profiles.filter((p) => p.department === d);
      let tot = 0;
      let done = 0;
      emps.forEach((p) => {
        const x = ctx.perEmployeeTaskCounts[p.id];
        if (x) {
          tot += x.total;
          done += x.done;
        }
      });
      return {
        report_section: "department_efficiency",
        department: d,
        employees: emps.length,
        task_completion_pct: tot ? Math.round((done / tot) * 100) : 0,
        tasks_total: tot,
        tasks_completed: done,
      };
    });
    return [
      {
        report_section: "summary",
        productivity_score: ctx.productivityScore,
        task_completion_pct: ctx.taskStats.total ? Math.round((ctx.taskStats.completed / ctx.taskStats.total) * 1000) / 10 : 0,
        revenue_growth_mom_pct: ctx.financeStats.growth,
        attendance_rate_pct: ctx.attendanceRateOverall,
        best_revenue_project: ctx.bestRevenueProject
          ? `${ctx.bestRevenueProject.name} (${formatInr(ctx.bestRevenueProject.amt)})`
          : "—",
        best_revenue_client: ctx.bestRevenueClient
          ? `${ctx.bestRevenueClient.name} (${formatInr(ctx.bestRevenueClient.amt)})`
          : "—",
      },
      ...performerRows,
      ...deptRows,
    ];
  }

  return [
    {
      total_employees: ctx.profiles.length,
      active_employees: ctx.activeEmployeesCount,
      total_clients: ctx.clients.length,
      total_projects: ctx.projects.length,
      total_tasks: ctx.taskStats.total,
      completed_tasks: ctx.taskStats.completed,
      attendance_rate_pct: ctx.attendanceRateOverall,
      monthly_revenue: ctx.financeStats.revThis,
      monthly_expense: ctx.financeStats.expThis,
    },
  ];
}
