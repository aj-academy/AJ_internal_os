export type ReportsTabId =
  | "overview"
  | "employees"
  | "attendance"
  | "clients"
  | "projects"
  | "tasks"
  | "finance"
  | "performance"
  | "export";

export const REPORTS_TAB_ORDER: ReportsTabId[] = [
  "overview",
  "employees",
  "attendance",
  "clients",
  "projects",
  "tasks",
  "finance",
  "performance",
  "export",
];

export const REPORTS_TAB_LABELS: Record<ReportsTabId, string> = {
  overview: "Overview",
  employees: "Employee Reports",
  attendance: "Attendance Reports",
  clients: "Client Reports",
  projects: "Project Reports",
  tasks: "Task Reports",
  finance: "Finance Reports",
  performance: "Performance Analytics",
  export: "Export Center",
};
