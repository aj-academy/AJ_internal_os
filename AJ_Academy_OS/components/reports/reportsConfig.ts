export type ReportsTabId =
  | "overview"
  | "employees"
  | "attendance"
  | "clients"
  | "calls"
  | "followups"
  | "daily"
  | "timeline"
  | "projects"
  | "tasks"
  | "finance"
  | "performance"
  | "export";

export const REPORTS_TAB_ORDER: ReportsTabId[] = [
  "overview",
  "employees",
  "daily",
  "attendance",
  "clients",
  "calls",
  "followups",
  "timeline",
  "projects",
  "tasks",
  "finance",
  "performance",
  "export",
];

export const REPORTS_TAB_LABELS: Record<ReportsTabId, string> = {
  overview: "Overview",
  employees: "Employee Reports",
  daily: "Daily Employee",
  attendance: "Attendance Reports",
  clients: "Client / Lead Reports",
  calls: "Call Report",
  followups: "Follow-up Report",
  timeline: "Employee Timeline",
  projects: "Project Reports",
  tasks: "Task Reports",
  finance: "Finance / Revenue",
  performance: "Performance Analytics",
  export: "Export Center",
};
